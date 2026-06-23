const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require('express');
const dotenv = require("dotenv");
const cors = require("cors");

const { MongoClient, ServerApiVersion } = require('mongodb');
dotenv.config();
const uri = process.env.MONGO_DB_URI;
const app = express()
const port = process.env.PORT;
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send("RecipeHub Server is running fine !!!")
})


const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.listen(port, () => {
  console.log(`Server Running On ${port}`)
})