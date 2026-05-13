const mysql = require("mysql2");

const connection = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "", // laragon biasanya kosong
    database: "kaoskoo_new"
});

connection.connect((err) => {
    if (err) {
        console.error("Database gagal connect:", err);
    } else {
        console.log("MySQL Connected");
    }
});

module.exports = connection;
