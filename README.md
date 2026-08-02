# 🚀 RecipeHub — Server API (Backend)

[![Live API](https://img.shields.io/badge/API-Live-blue?style=for-the-badge&logo=node.js)](https://recipehub-server-mauve.vercel.app)
[![Express.js](https://img.shields.io/badge/Express.js-5.x-lightgrey?style=for-the-badge&logo=express)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Driver-green?style=for-the-badge&logo=mongodb)](https://www.mongodb.com/)

The robust and secure backend server for **RecipeHub**, built with Node.js and Express.js, providing RESTful APIs, JWT authentication with HTTP-only cookies, Stripe payment webhooks/sessions, and database interaction via the native MongoDB driver.

---

## 🔗 Links & Resources
* **Live Server API:** [https://recipehub-server-mauve.vercel.app](https://recipehub-server-mauve.vercel.app)
* **Frontend Repository:** [GitHub Frontend Repository](https://github.com/fireflyurmi/recipe-hub)
* **Live Frontend App:** [https://recipehub-henna.vercel.app](https://recipehub-henna.vercel.app)

---

## ⚙️ Core Architecture & Features

* **RESTful Routing:** Modular endpoints managing users, recipes, favorites, reports, payments, and analytics.
* **JWT Authentication Middleware:** Secure token generation, storage via HTTP-only cookies, and verification middleware protecting sensitive dashboard and admin APIs.
* **Database Operations:** Direct querying and aggregation pipelines using the native `mongodb` driver with secure connection string handling.
* **Stripe Integration:** Payment intent and checkout session handling for premium memberships and recipe purchases.
* **CORS & Cookie Parsing:** Configured with `cors` and `cookie-parser` to support seamless cross-origin communication with the Next.js frontend.

---

## 🛠️ Tech Stack & Dependencies

* **Runtime:** Node.js
* **Framework:** Express.js (`v5.2.1`)
* **Database:** MongoDB Native Driver (`v7.3.0`)
* **Authentication & Security:** `cookie-parser`, `jose-cjs` (JWT handling)
* **Payments:** `stripe`
* **Environment & Utility:** `dotenv`, `cors`

---

## 🗄️ Database Collections Schema Overview

1. **`users`**: Stores user profiles (`name`, `email`, `image`, `role`, `isBlocked`, `isPremium`, timestamps).
2. **`recipes`**: Stores recipe details (`recipeName`, `recipeImage`, `category`, `cuisineType`, `difficultyLevel`, `preparationTime`, `ingredients`, `instructions`, `authorId`, `authorName`, `authorEmail`, `likesCount`, `isFeatured`, `status`, timestamps).
3. **`favorites`**: Links saved recipes to users (`userEmail`, `userId`, `recipeId`, `addedAt`).
4. **`reports`**: Tracks flagged content (`recipeId`, `reporterEmail`, `reason`, `status`, `createdAt`).
5. **`payments`**: Logs transactions (`userEmail`, `userId`, `amount`, `recipeId`, `transactionId`, `paymentStatus`, `paidAt`).



