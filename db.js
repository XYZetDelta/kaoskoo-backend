const mysql = require("mysql2")

const db = mysql.createConnection(process.env.MYSQL_PUBLIC_URL || process.env.MYSQL_URL || {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
})

db.connect((err) => {
  if (err) console.error("Database gagal connect:", err)
  else console.log("Database connected!")
})

module.exports = db