const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;
const uri = process.env.MONGO_DB_URI;

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-user-email", "Authorization"],
  })
);
app.use(express.json());
app.use(cookieParser());

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// --- Auth Middleware ---
const verifyToken = async (req, res, next) => {
  try {
    const userEmail = req.headers["x-user-email"];

    if (!userEmail) {
      return res
        .status(401)
        .send({ message: "Unauthorized access - No session identifier found" });
    }

    const db = client.db(process.env.AUTH_DB_NAME);
    const usersCollection = db.collection("user");

    const user = await usersCollection.findOne({ email: userEmail });

    if (!user) {
      return res.status(401).send({ message: "Unauthorized: User not found" });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Auth Middleware Error:", error);
    return res.status(403).send({ message: "Forbidden: Invalid token", error });
  }
};

// --- Admin Middleware ---
const verifyAdmin = async (req, res, next) => {
  try {
    const user = req.user;

    if (!user || user.role !== "admin") {
      return res
        .status(403)
        .send({ message: "Forbidden: Admin access required" });
    }

    next();
  } catch (error) {
    console.error("Admin Middleware Error:", error);
    return res.status(403).send({ message: "Forbidden: Invalid admin status" });
  }
};

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

    // -------------------- AUTH VERIFICATION (Public Route) --------------------
    app.post("/login-verify", async (req, res) => {
      try {
        const { email } = req.body;
        if (!email) {
          return res.send({ blocked: false });
        }
        const user = await usersCollection.findOne({ email });

        if (user && user.isBlocked === true) {
          return res.send({
            blocked: true,
            message:
              "Your account has been blocked by the admin. Please contact support.",
          });
        }

        res.send({ blocked: false });
      } catch (error) {
        console.error("Error verifying user status:", error);
        res.status(500).send({ message: "Error verifying user status" });
      }
    });

    // ----------------------------- ADMIN STATS ROUTE -----------------------
    app.get("/admin-stats", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const totalUsers = await usersCollection.countDocuments();
        const totalRecipes = await recipesCollection.countDocuments();
        const premiumMembers = await usersCollection.countDocuments({
          isPremium: true,
        });
        const totalReports = await reportsCollection.countDocuments();

        const categoryDataRaw = await recipesCollection
          .aggregate([
            {
              $group: {
                _id: "$category",
                count: { $sum: 1 },
              },
            },
          ])
          .toArray();

        const categoryData = categoryDataRaw.map((item) => ({
          name: item._id || "Uncategorized",
          value: item.count,
        }));

        const userGrowthData = [
          { name: "Jan", users: Math.floor(totalUsers * 0.1) },
          { name: "Feb", users: Math.floor(totalUsers * 0.2) },
          { name: "Mar", users: Math.floor(totalUsers * 0.3) },
          { name: "Apr", users: Math.floor(totalUsers * 0.4) },
          { name: "May", users: Math.floor(totalUsers * 0.5) },
          { name: "Jun", users: Math.floor(totalUsers * 0.6) },
          { name: "Jul", users: totalUsers },
          { name: "Aug", users: totalUsers },
          { name: "Sep", users: totalUsers },
          { name: "Oct", users: totalUsers },
          { name: "Nov", users: totalUsers },
          { name: "Dec", users: totalUsers },
        ];

        res.send({
          totalUsers,
          totalRecipes,
          premiumMembers,
          totalReports,
          categoryData,
          userGrowthData,
        });
      } catch (error) {
        console.error("Error fetching admin stats:", error);
        res.status(500).send({ message: "Error fetching admin stats", error });
      }
    });

    // ----------------------------- MANAGE USERS ROUTES -----------------------
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const result = await usersCollection.find().toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).send({ message: "Error fetching users", error });
      }
    });

    app.patch(
      "/users/block/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const id = req.params.id;
          const { isBlocked } = req.body;

          if (!ObjectId.isValid(id)) {
            return res.status(400).send({ message: "Invalid user ID" });
          }

          const result = await usersCollection.updateOne(
            { _id: new ObjectId(id) },
            {
              $set: {
                isBlocked: isBlocked,
                updatedAt: new Date(),
              },
            }
          );

          res.send(result);
        } catch (error) {
          console.error("Error updating user status:", error);
          res
            .status(500)
            .send({ message: "Error updating user status", error });
        }
      }
    );

    // ----------------------------- ADMIN RECIPE REPORTS ROUTES -----------------------
    app.get(
      "/admin/recipe-reports",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const reports = await reportsCollection
            .aggregate([
              {
                $addFields: {
                  recipeObjId: {
                    $cond: {
                      if: {
                        $regexMatch: {
                          input: "$recipeId",
                          regex: /^[0-9a-fA-F]{24}$/,
                        },
                      },
                      then: { $toObjectId: "$recipeId" },
                      else: null,
                    },
                  },
                },
              },
              {
                $lookup: {
                  from: "recipes",
                  localField: "recipeObjId",
                  foreignField: "_id",
                  as: "recipeDetails",
                },
              },
              {
                $lookup: {
                  from: "user",
                  localField: "reporterEmail",
                  foreignField: "email",
                  as: "reporterDetails",
                },
              },
              {
                $addFields: {
                  recipeInfo: { $arrayElemAt: ["$recipeDetails", 0] },
                  reporterName: {
                    $ifNull: [
                      { $arrayElemAt: ["$reporterDetails.name", 0] },
                      "$reporterEmail",
                    ],
                  },
                },
              },
              {
                $project: {
                  recipeDetails: 0,
                  reporterDetails: 0,
                  recipeObjId: 0,
                },
              },
            ])
            .toArray();

          res.send(reports);
        } catch (error) {
          console.error("Error fetching recipe reports:", error);
          res
            .status(500)
            .send({ message: "Error fetching recipe reports", error });
        }
      }
    );

    app.delete(
      "/admin/reports/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const reportId = req.params.id;
          const query = ObjectId.isValid(reportId)
            ? { _id: new ObjectId(reportId) }
            : { _id: reportId };
          const result = await reportsCollection.deleteOne(query);
          res.send(result);
        } catch (error) {
          console.error("Error deleting report:", error);
          res.status(500).send({ message: "Error deleting report", error });
        }
      }
    );

    app.delete(
      "/admin/recipes/:recipeId",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const recipeId = req.params.recipeId;
          const recipeQuery = ObjectId.isValid(recipeId)
            ? { _id: new ObjectId(recipeId) }
            : { _id: recipeId };

          await recipesCollection.deleteOne(recipeQuery);
          await reportsCollection.deleteMany({ recipeId: recipeId });

          res.send({
            success: true,
            message: "Recipe and its reports removed successfully.",
          });
        } catch (error) {
          console.error("Error removing recipe by admin:", error);
          res.status(500).send({ message: "Error removing recipe", error });
        }
      }
    );

    // ----------------------------- ADMIN TRANSACTIONS ROUTE -----------------------
    app.get(
      "/admin/transactions",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const result = await paymentsCollection
            .aggregate([
              {
                $lookup: {
                  from: "user",
                  localField: "userEmail",
                  foreignField: "email",
                  as: "userInfo",
                },
              },
              {
                $unwind: {
                  path: "$userInfo",
                  preserveNullAndEmptyArrays: true,
                },
              },
              {
                $match: {
                  "userInfo.role": { $ne: "admin" },
                },
              },
              {
                $project: {
                  amount: 1,
                  paidAt: 1,
                  transactionId: 1,
                  paymentStatus: 1,
                  userEmail: 1,
                  "userInfo.name": 1,
                  "userInfo.image": 1,
                },
              },
              {
                $sort: { paidAt: -1 },
              },
            ])
            .toArray();

          res.send(result);
        } catch (error) {
          console.error("Error fetching transactions:", error);
          res
            .status(500)
            .send({ message: "Error fetching transactions", error });
        }
      }
    );

    // ----------------------------- USERS ROUTE -----------------------
    app.get("/all-recipes", async (req, res) => {
      try {
        const { category } = req.query;
        let query = {};

        if (category && category !== "All") {
          const categoriesArray = category.split(",");
          query = { category: { $in: categoriesArray } };
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const totalRecipes = await recipesCollection.countDocuments(query);
        const result = await recipesCollection
          .find(query)
          .skip(skip)
          .limit(limit)
          .toArray();

        res.send({
          recipes: result,
          totalPages: Math.ceil(totalRecipes / limit),
          currentPage: page,
          totalRecipes,
        });
      } catch (error) {
        res.status(500).send({ message: "Error fetching recipes", error });
      }
    });

    app.get("/featured-recipes", async (req, res) => {
      try {
        const result = await recipesCollection
          .find({ isFeatured: true })
          .toArray();
        res.send(result);
      } catch (error) {
        res
          .status(500)
          .send({ message: "Error fetching featured recipes", error });
      }
    });

    app.get("/recipes", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const result = await recipesCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error fetching recipes", error });
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

    app.get("/my-recipes/:email", verifyToken, async (req, res) => {
      try {
        const result = await recipesCollection
          .find({ authorEmail: req.params.email })
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error fetching recipes" });
      }
    });

    app.get("/payments/:email", verifyToken, async (req, res) => {
      try {
        const email = req.params.email;
        if (req.user?.email !== email) {
          return res.status(403).send({ message: "Forbidden: Access denied" });
        }

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

    app.get("/favorites", verifyToken, async (req, res) => {
      try {
        const email = req.user.email;
        const result = await favoritesCollection
          .find({ userEmail: email })
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error fetching favorites", error });
      }
    });

    app.get("/user-stats/:email", verifyToken, async (req, res) => {
      try {
        const email = req.params.email;

        if (req.user?.email !== email && req.user?.role !== "admin") {
          return res.status(403).send({ message: "Forbidden: Access denied" });
        }

        const recipesCount = await recipesCollection.countDocuments({
          authorEmail: email,
        });

        const favoritesCount = await favoritesCollection.countDocuments({
          userEmail: email,
        });

        const likesResult = await recipesCollection
          .aggregate([
            { $match: { authorEmail: email } },
            { $group: { _id: null, totalLikes: { $sum: "$likesCount" } } },
          ])
          .toArray();

        res.send({
          recipes: recipesCount,
          favorites: favoritesCount,
          likes: likesResult[0]?.totalLikes || 0,
        });
      } catch (error) {
        res.status(500).send({ message: "Error fetching user stats", error });
      }
    });

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

    // ------------------------------ POST ---------------------------------
    app.post("/recipes", verifyToken, async (req, res) => {
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

    app.post("/payments", verifyToken, async (req, res) => {
      try {
        const { paymentType, userEmail, ...paymentDetails } = req.body;
        if (req.user?.email !== userEmail) {
          return res
            .status(403)
            .send({ message: "Forbidden: Unauthorized user match" });
        }

        const result = await paymentsCollection.insertOne({
          ...paymentDetails,
          userEmail,
          paymentType: paymentType || "purchase",
          paidAt: new Date(),
        });

        if (paymentType === "subscription") {
          await usersCollection.updateOne(
            { email: userEmail },
            { $set: { isPremium: true } }
          );
        }

        res.status(201).send(result);
      } catch (error) {
        res.status(500).send({ message: "Error saving payment", error });
      }
    });

    app.post("/save-payment", verifyToken, async (req, res) => {
      try {
        const { sessionId, userEmail } = req.body;

        if (req.user?.email !== userEmail) {
          return res.status(403).send({ message: "Forbidden: Access denied" });
        }

        const existingPayment = await paymentsCollection.findOne({ sessionId });
        if (existingPayment) {
          return res.status(200).send({
            message: "Payment already recorded",
            payment: existingPayment,
          });
        }

        const stripeSession =
          await stripe.checkout.sessions.retrieve(sessionId);

        if (!stripeSession || stripeSession.payment_status !== "paid") {
          return res
            .status(400)
            .send({ message: "Invalid or unpaid Stripe session" });
        }

        const paymentData = {
          sessionId: stripeSession.id,
          transactionId: stripeSession.payment_intent,
          userEmail: userEmail,
          amount: stripeSession.amount_total / 100,
          currency: stripeSession.currency,
          paymentStatus: stripeSession.payment_status,
          paymentType: stripeSession.metadata?.paymentType || "recipe_purchase",
          recipeId: stripeSession.metadata?.recipeId || null,
          paidAt: new Date(),
        };

        const result = await paymentsCollection.insertOne(paymentData);
        res.status(201).send({ success: true, insertedId: result.insertedId });
      } catch (error) {
        console.error("Error verifying and saving payment from Stripe:", error);
        res.status(500).send({
          message: "Internal server error while saving payment",
          error,
        });
      }
    });

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

    app.post("/reports", async (req, res) => {
      try {
        const { recipeId, reporterEmail, reason } = req.body;
        const result = await reportsCollection.insertOne({
          recipeId,
          reporterEmail,
          reason,
          status: "pending",
          createdAt: new Date(),
        });
        res.status(201).send(result);
      } catch (error) {
        res.status(500).send({ message: "Error submitting report", error });
      }
    });

    // ------------------------------------ DELETE --------------------------------------
    app.delete("/recipes/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid recipe ID" });
        }

        const recipe = await recipesCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!recipe) {
          return res.status(404).send({ message: "Recipe not found" });
        }

        const isOwner = recipe.authorEmail === req.user.email;
        const isAdmin = req.user.role === "admin";

        if (!isOwner && !isAdmin) {
          return res.status(403).send({
            message: "Forbidden: You can only delete your own recipes",
          });
        }

        const result = await recipesCollection.deleteOne({
          _id: new ObjectId(id),
        });

        res.send(result);
      } catch (error) {
        console.error("Error deleting recipe:", error);
        res.status(500).send({ message: "Error deleting recipe" });
      }
    });

    app.delete("/favorites/:recipeId", verifyToken, async (req, res) => {
      try {
        const { recipeId } = req.params;
        const userEmail = req.user.email;

        const result = await favoritesCollection.deleteOne({
          userEmail: userEmail,
          $or: [{ recipeId: recipeId }, { recipeId: new ObjectId(recipeId) }],
        });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error deleting favorite", error });
      }
    });

    // ------------------------------------ PATCH ------------------------------------
    app.patch("/recipes/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid recipe ID" });
        }

        const recipe = await recipesCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!recipe) {
          return res.status(404).send({ message: "Recipe not found" });
        }

        const isOwner = recipe.authorEmail === req.user.email;
        const isAdmin = req.user.role === "admin";

        if (!isOwner && !isAdmin) {
          return res.status(403).send({
            message: "Forbidden: You can only edit your own recipes",
          });
        }

        const result = await recipesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: req.body }
        );

        res.send(result);
      } catch (error) {
        console.error("Error updating recipe:", error);
        res.status(500).send({ message: "Error updating recipe", error });
      }
    });

    app.patch(
      "/recipes/:id/featured",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const { isFeatured } = req.body;
          const result = await recipesCollection.updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { isFeatured: isFeatured } }
          );
          res.send(result);
        } catch (error) {
          res
            .status(500)
            .send({ message: "Error updating featured status", error });
        }
      }
    );

    app.patch("/recipes/like/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await recipesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $inc: { likesCount: 1 } }
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error updating likes count", error });
      }
    });

    app.patch("/users/:email", verifyToken, async (req, res) => {
      try {
        const email = req.params.email;

        if (req.user?.email !== email) {
          return res.status(403).send({ message: "Forbidden: Access denied" });
        }

        const { name, image } = req.body;

        const result = await usersCollection.updateOne(
          { email: email },
          {
            $set: {
              name: name?.trim(),
              image: image?.trim(),
            },
          }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: "User not found" });
        }

        const updatedUser = await usersCollection.findOne(
          { email },
          { projection: { password: 0 } }
        );

        res.send({
          success: true,
          modifiedCount: result.modifiedCount,
          message:
            result.modifiedCount > 0
              ? "Profile updated successfully"
              : "No changes detected",
          user: updatedUser,
        });
      } catch (error) {
        console.error("Error updating profile:", error);
        res.status(500).send({ message: "Error updating profile", error });
      }
    });

    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("Database connection error:", error);
  }
}

run().catch(console.dir);

// Only listen when running locally (not on Vercel)
if (require.main === module) {
  app.listen(port, () => {
    console.log(`RecipeHub Server is running on port ${port}`);
  });
}

// Export for Vercel
module.exports = app;