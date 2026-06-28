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

    // Root check
    app.get("/", (req, res) => {
      res.send("RecipeHub Server is running fine !!!");
    });

    // --- Browse Recipes & Details Routes ---
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

    app.get("/payments/:email", async (req, res) => {
  try {
    const email = req.params.email;
    const result = await paymentsCollection.aggregate([
      { $match: { userEmail: email } },
      {
        $project: {
          amount: 1,
          paidAt: 1,
          recipeId: 1,
          transactionId: 1,     
          paymentStatus: 1,      
        },
      },
    ]).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Error fetching payments" });
  }
});

    // My recipes API
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

    // DELETE
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

    // UPDATE
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
