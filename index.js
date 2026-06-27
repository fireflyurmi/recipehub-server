const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const uri = process.env.MONGO_DB_URI;

app.use(
  cors({
    origin: [process.env.CLIENT_URL],
    credentials: true,
  })
);
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

    // Root check
    app.get("/", (req, res) => {
      res.send("RecipeHub Server is running fine !!!");
    });

    // POST API Route for Add Recipe
    app.post("/recipes", async (req, res) => {
      try {
        const recipeData = req.body;
        const { authorEmail } = recipeData;

        // 1. Check user premium status
        const user = await usersCollection.findOne({ email: authorEmail });
        
        // 2. Count existing recipes for this user
        const userRecipeCount = await recipesCollection.countDocuments({ authorEmail });

        // 3. Logic: If NOT premium and count >= 2, block addition
        // We check if user exists and if they are premium
        const isPremium = user?.isPremium === true;

        if (!isPremium && userRecipeCount >= 2) {
          return res.status(403).send({ 
            message: "Recipe limit reached! Please upgrade to Premium for unlimited access." 
          });
        }

        // 4. Proceed with insertion
        const result = await recipesCollection.insertOne(recipeData);
        res.status(201).send(result);
        
      } catch (error) {
        res.status(500).send({ message: "Error adding recipe", error });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
    
  } catch (err) {
    console.error("MongoDB Connection Error:", err);
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server Running On ${port}`);
});