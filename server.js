require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser")
const path = require("path");
const db = require("./db");

const app = express();
const fs = require("fs");

app.use(cors({
  origin: [
    "http://localhost:3000",
    "https://kaoskoo-frontend.vercel.app"  // ← tambah ini
  ],
  credentials: true
}))
app.use(express.json());
app.use("/uploads", express.static("uploads"));
app.use(cookieParser())

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// API
app.get("/api/products", (req, res) => {
  const page = parseInt(req.query.page) || 1
  const limit = parseInt(req.query.limit) || 12
  const offset = (page - 1) * limit

  db.query("SELECT COUNT(*) as total FROM products", (err, countResult) => {
    if (err) return res.status(500).json(err)

    const total = countResult[0].total
    const totalPages = Math.ceil(total / limit)

    // Subquery di FROM agar kompatibel dengan MariaDB
    const query = `
      SELECT p.*, pi.image
      FROM (SELECT * FROM products ORDER BY id DESC LIMIT ? OFFSET ?) p
      LEFT JOIN product_images pi ON p.id = pi.product_id
      ORDER BY p.id DESC, pi.sort_order ASC
    `

    db.query(query, [limit, offset], (err, results) => {
      if (err) return res.status(500).json(err)

      const products = {}

      results.forEach(row => {
        if (!products[row.id]) {
          products[row.id] = {
            id: row.id,
            name: row.name,
            price: row.price,
            description: row.description,
            images: []
          }
        }

        if (row.image) {
          products[row.id].images.push(row.image)
        }
      })

      res.json({
        data: Object.values(products),
        pagination: {
          total,
          totalPages,
          currentPage: page,
          limit
        }
      })
    })
  })
});

app.post("/api/products", verifyToken, upload.array("image", 5), (req, res) => {
  const { name, price, description} = req.body;
  const images = req.files;

  db.query(
    "INSERT INTO products (name, price, description) VALUES (?, ?, ?)",
    [name, price, description],
    (err, result) => {
      if (err) return res.status(500).json(err);

      const productId = result.insertId;

      if (images && images.length > 0) {
        images.forEach((file, sortIndex) => {
          db.query(
            "INSERT INTO product_images (product_id, image, sort_order) VALUES (?, ?, ?)",
            [productId, file.filename, sortIndex]
          )
        });
      }

      res.json({ message: "Product added" });
    }
  );
});

app.put("/api/products/:id", verifyToken, upload.array("image", 5), (req, res) => {
  const { id } = req.params
  const { name, price, description } = req.body
  const newFiles = req.files

  let keepImages = req.body.keepImages || []
  if (!Array.isArray(keepImages)) keepImages = [keepImages]

  let order = []
  try {
    order = JSON.parse(req.body.order || "[]")
  } catch {
    order = []
  }

  db.query(
    "UPDATE products SET name=?, price=?, description=? WHERE id=?",
    [name, price, description, id],
    (err) => {
      if (err) return res.status(500).json(err)

      db.query("SELECT image FROM product_images WHERE product_id = ?", [id], (err, oldImages) => {
        if (err) return res.status(500).json(err)

        const toDelete = oldImages.filter(({ image }) => !keepImages.includes(image))
        toDelete.forEach(({ image }) => {
          const filePath = path.join(__dirname, "uploads", image)
          fs.unlink(filePath, (err) => {
            if (err) console.warn("Gagal hapus file:", filePath)
          })
        })

        db.query("DELETE FROM product_images WHERE product_id = ?", [id], (err) => {
          if (err) return res.status(500).json(err)

          let newFileIndex = 0
          order.forEach((item, sortIndex) => {
            if (item === "__new__") {
              const file = newFiles[newFileIndex++]
              if (file) {
                db.query(
                  "INSERT INTO product_images (product_id, image, sort_order) VALUES (?, ?, ?)",
                  [id, file.filename, sortIndex]
                )
              }
            } else {
              db.query(
                "INSERT INTO product_images (product_id, image, sort_order) VALUES (?, ?, ?)",
                [id, item, sortIndex]
              )
            }
          })

          res.json({ message: "Product updated" })
        })
      })
    }
  )
})

app.delete("/api/products/:id", verifyToken, (req, res) => {
  const { id } = req.params;

  db.query("SELECT image FROM product_images WHERE product_id = ?", [id], (err, images) => {
    if (err) return res.status(500).json(err);

    db.query("DELETE FROM products WHERE id = ?", [id], (err) => {
      if (err) return res.status(500).json(err);

      images.forEach(({ image }) => {
        const filePath = path.join(__dirname, "uploads", image);
        fs.unlink(filePath, (err) => {
          if (err) console.warn("Gagal hapus file:", filePath);
        });
      });

      res.json({ message: "Product deleted" });
    });
  });
});

app.get("/api/products/:id", (req, res) => {
  const { id } = req.params;

  const query = `
    SELECT p.*, pi.image
    FROM products p
    LEFT JOIN product_images pi ON p.id = pi.product_id
    WHERE p.id = ?
    ORDER BY pi.sort_order ASC
  `;

  db.query(query, [id], (err, results) => {
    if (err) return res.status(500).json(err);
    if (results.length === 0) return res.status(404).json({ message: "Product not found" });

    const product = {
      id: results[0].id,
      name: results[0].name,
      price: results[0].price,
      description: results[0].description,
      images: results.filter(r => r.image).map(r => r.image)
    };

    res.json(product);
  });
});

app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body

  db.query("SELECT * FROM admins WHERE username = ?", [username], async (err, results) => {
    if (err) return res.status(500).json(err)
    if (results.length === 0) return res.status(401).json({ message: "Username salah" })

    const admin = results[0]
    const validPassword = await bcrypt.compare(password, admin.password)
    if (!validPassword) return res.status(401).json({ message: "Password salah" })

    const token = jwt.sign({ id: admin.id }, process.env.JWT_SECRET, { expiresIn: "1h" })

    res.cookie("token", token, {
    httpOnly: true,
    secure: true,        // ← ganti false ke true karena sudah HTTPS
    sameSite: "none",    // ← ganti strict ke none untuk cross-domain
    maxAge: 60 * 60 * 1000
  })

    res.json({ message: "Login berhasil" })
  })
})

app.post("/api/admin/logout", (req, res) => {
  res.clearCookie("token", {
  httpOnly: true,
  secure: true,
  sameSite: "none"
})
  res.json({ message: "Logged out" })
})

function verifyToken(req, res, next) {
  const token = req.cookies.token

  if (!token) return res.sendStatus(403)

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403)
    req.user = user
    next()
  })
}

app.get("/api/admin/me", verifyToken, (req, res) => {
  res.json({ loggedIn: true })
})

app.listen(5000, () => {
  console.log("API running on ${process.env.REACT_APP_API_URL}");
});