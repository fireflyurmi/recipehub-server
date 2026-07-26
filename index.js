const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const uri = process.env.MONGO_DB_URI;

app.use(cors({ origin: [process.env.CLIENT_URL], credentials: true }));
app.use(express.json());

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    const db = client.db(process.env.AUTH_DB_NAME);

    // Collections
    const recipesCollection = db.collection("recipes");
    const usersCollection = db.collection("user");
    const paymentsCollection = db.collection("payments");
    const favoritesCollection = db.collection("favorites");
    const reportsCollection = db.collection("reports");

    // Root check
    app.get("/", (req, res) => {
      res.send("RecipeHub Server is running fine !!!");
    });
    // -----------------------------USERS ROUTE-----------------------

    // ---------------------------------GET-------------------------------
    app.get("/all-recipes", async (req, res) => {
      try {
        const { category } = req.query;
        let query = {};
        if (category && category !== "All") {
          const categoriesArray = category.split(",");
          query = { category: { $in: categoriesArray } };
        }
        const result = await recipesCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error fetching recipes" });
      }
    });

    app.get("/recipes/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await recipesCollection.findOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error fetching recipe details" });
      }
    });

    app.get("/my-recipes/:email", async (req, res) => {
      try {
        const result = await recipesCollection
          .find({ authorEmail: req.params.email })
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error fetching recipes" });
      }
    });

    app.get("/payments/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const result = await paymentsCollection
          .aggregate([
            {
              $match: {
                userEmail: email,
                paymentType: { $ne: "subscription" },
              },
            },
            {
              $project: {
                amount: 1,
                paidAt: 1,
                recipeId: 1,
                transactionId: 1,
                paymentStatus: 1,
                paymentType: 1,
              },
            },
          ])
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error fetching payments" });
      }
    });

    app.get("/favorites/:email", async (req, res) => {
      const email = req.params.email;
      const result = await favoritesCollection
        .find({ userEmail: email })
        .toArray();
      res.send(result);
    });

    // For User Dashboard
    app.get("/user-stats/:email", async (req, res) => {
      const email = req.params.email;

      const recipesCount = await recipesCollection.countDocuments({
        authorEmail: email,
      });

      const favoritesCount = await favoritesCollection.countDocuments({
        userEmail: email,
      });

      const likesResult = await recipesCollection
        .aggregate([
          { $match: { authorEmail: email } },
          // Change "$likes" to "$likesCount" to match your PATCH logic
          { $group: { _id: null, totalLikes: { $sum: "$likesCount" } } },
        ])
        .toArray();

      res.send({
        recipes: recipesCount,
        favorites: favoritesCount,
        likes: likesResult[0]?.totalLikes || 0,
      });
    });

    // For Popular Recipes
    app.get("/popular-recipes", async (req, res) => {
      try {
        const popular = await recipesCollection
          .find()
          .sort({ likesCount: -1 })
          .limit(5)
          .toArray();
        res.send(popular);
      } catch (error) {
        res.status(500).send({ message: "Error fetching popular recipes" });
      }
    });

    // ------------------------------POST---------------------------------
    // For recipes
    app.post("/recipes", async (req, res) => {
      try {
        const recipeData = req.body;
        const { authorEmail } = recipeData;
        const user = await usersCollection.findOne({ email: authorEmail });
        const userRecipeCount = await recipesCollection.countDocuments({
          authorEmail,
        });
        const isPremium = user?.isPremium === true;

        if (!isPremium && userRecipeCount >= 2) {
          return res.status(403).send({
            message: "Recipe limit reached! Please upgrade to Premium.",
          });
        }

        const result = await recipesCollection.insertOne(recipeData);
        res.status(201).send(result);
      } catch (error) {
        res.status(500).send({ message: "Error adding recipe", error });
      }
    });
    // For Payments
    app.post("/payments", async (req, res) => {
      try {
        const { paymentType, userEmail, ...paymentDetails } = req.body;

        const result = await paymentsCollection.insertOne({
          ...paymentDetails,
          userEmail,
          paymentType,
          paidAt: new Date(),
        });

        if (paymentType === "subscription") {
          await usersCollection.updateOne(
            { email: userEmail },
            { $set: { isPremium: true } },
          );
        }

        res.status(201).send(result);
      } catch (error) {
        res.status(500).send({ message: "Error saving payment", error });
      }
    });

    // For Favorites
    app.post("/favorites", async (req, res) => {
      const { userEmail, userId, recipeId } = req.body;
      const result = await favoritesCollection.insertOne({
        userEmail,
        userId,
        recipeId,
        addedAt: new Date(),
      });
      res.send(result);
    });

    // For Reports
    app.post("/reports", async (req, res) => {
      try {
        const { recipeId, reporterEmail, reason } = req.body;
        const result = await reportsCollection.insertOne({
          recipeId,
          reporterEmail,
          reason,
          status: "pending", // Default status
          createdAt: new Date(),
        });
        res.status(201).send(result);
      } catch (error) {
        res.status(500).send({ message: "Error submitting report", error });
      }
    });

    // ------------------------------------DELETE--------------------------------------
    app.delete("/recipes/:id", async (req, res) => {
      try {
        const result = await recipesCollection.deleteOne({
          _id: new ObjectId(req.params.id),
        });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error deleting recipe" });
      }
    });

    app.delete("/favorites/:recipeId", async (req, res) => {
      const { recipeId } = req.params;
      const result = await favoritesCollection.deleteOne({
        recipeId: recipeId,
      });
      res.send(result);
    });

    // ------------------------------------PATCH------------------------------------
    app.patch("/recipes/:id", async (req, res) => {
      try {
        const result = await recipesCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: req.body },
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error updating recipe", error });
      }
    });

    // For Like Counts
    app.patch("/recipes/like/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await recipesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $inc: { likesCount: 1 } },
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error updating likes count", error });
      }
    });

    // For User-Profile
    app.patch("/users/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const { name, image } = req.body;

        const result = await usersCollection.updateOne(
          { email: email },
          {
            $set: {
              name: name,
              image: image,
            },
          },
        );

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error updating user profile", error });
      }
    });

    // -------------------- AUTH VERIFICATION --------------------

    app.post("/login-verify", async (req, res) => {
      try {
        const { email } = req.body;
        const user = await usersCollection.findOne({ email });

        if (user && user.isBlocked === true) {
          return res.status(403).send({
            blocked: true,
            message:
              "Your account has been blocked by the admin. Please contact support.",
          });
        }

        res.send({ blocked: false });
      } catch (error) {
        res.status(500).send({ message: "Error verifying user status" });
      }
    });

    // -------------------- ADMIN ROUTES --------------------

    // 1. GET all users for the Admin Dashboard
    app.get("/users", async (req, res) => {
      try {
        const result = await usersCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error fetching users", error });
      }
    });

    // 2. PATCH to Block/Unblock a user
    app.patch("/users/block/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { isBlocked } = req.body;

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            isBlocked: isBlocked,
            updatedAt: new Date(),
          },
        };

        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error updating user status", error });
      }
    });

    // Get all recipes for Admin Dashboard
    app.get("/recipes", async (req, res) => {
      try {
        const result = await recipesCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error fetching all recipes" });
      }
    });

    // PATCH to update Featured status of a recipe
    app.patch("/recipes/:id/featured", async (req, res) => {
      try {
        const id = req.params.id;
        const { isFeatured } = req.body;
        const result = await recipesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { isFeatured: isFeatured } },
        );
        res.send(result);
      } catch (error) {
        res
          .status(500)
          .send({ message: "Error updating featured status", error });
      }
    });

    // Admin Dashboard Overview API 
    app.get("/admin-stats", async (req, res) => {
      try {
        // Exclude admin from total users count 
        const totalUsers = await usersCollection.countDocuments({
          role: { $ne: "admin" },
        });
        const totalRecipes = await recipesCollection.countDocuments();
        const premiumMembers = await usersCollection.countDocuments({
          isPremium: true,
          role: { $ne: "admin" },
        });
        const totalReports = await reportsCollection.countDocuments();

        // Recipe category distribution 
        const categoryAggregation = await recipesCollection
          .aggregate([
            { $group: { _id: "$category", count: { $sum: 1 } } },
            { $project: { name: "$_id", value: "$count", _id: 0 } },
          ])
          .toArray();

        // 12-Month User Growth Aggregation (excluding admins)
        let userGrowthData = [];
        try {
          userGrowthData = await usersCollection
            .aggregate([
              { $match: { role: { $ne: "admin" } } },
              {
                $project: {
                  month: {
                    $dateToString: {
                      format: "%b",
                      date: { $ifNull: ["$createdAt", new Date()] },
                    },
                  },
                },
              },
              {
                $group: {
                  _id: "$month",
                  users: { $sum: 1 },
                },
              },
            ])
            .toArray();
        } catch (err) {
          userGrowthData = [];
        }

        const monthsOrder = [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ];
        const completeUserGrowthData = monthsOrder.map((month) => {
          const found = userGrowthData.find((item) => item._id === month);
          return { name: month, users: found ? found.users : 0 };
        });

        res.send({
          totalUsers,
          totalRecipes,
          premiumMembers,
          totalReports,
          categoryData: categoryAggregation,
          userGrowthData: completeUserGrowthData,
        });
      } catch (error) {
        res.status(500).send({ message: "Error fetching admin stats", error });
      }
    });

    // Ping check
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } catch (err) {
    console.error("MongoDB Connection Error:", err);
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server Running On ${port}`);
});
