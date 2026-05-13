const bcrypt = require("bcryptjs");
const db = require("./db");

const username = "admin"; // ganti bebas
const password = "123456"; // ganti bebas

bcrypt.hash(password, 10).then(hash => {
  db.query(
    "INSERT INTO admins (username, password) VALUES (?, ?)",
    [username, hash],
    (err, result) => {
      if (err) console.log(err);
      else console.log("Admin berhasil dibuat!");
      process.exit();
    }
  );
});