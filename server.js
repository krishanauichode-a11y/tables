require("dotenv").config();
const express = require("express");
const cors = require("cors");
const db = require("./db");

const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json());

/* ================= EMPLOYEES ================= */
app.get("/employees", async (req, res) => {
  const r = await db.query("SELECT * FROM employees ORDER BY id");
  res.json(r.rows);
});

app.post("/employees", async (req, res) => {
  const { name } = req.body;
  await db.query(
    "INSERT INTO employees(name) VALUES($1) ON CONFLICT DO NOTHING",
    [name]
  );
  res.sendStatus(200);
});

/* ================= DAILY ================= */
app.post("/daily", async (req, res) => {
  const { employeeId, month, day, value } = req.body;
  await db.query(`
    INSERT INTO daily_bookings(employee_id, month, day, value)
    VALUES($1,$2,$3,$4)
    ON CONFLICT (employee_id, month, day)
    DO UPDATE SET value=$4
  `, [employeeId, month, day, value]);
  res.sendStatus(200);
});

app.get("/daily/:month", async (req, res) => {
  const r = await db.query(
    "SELECT * FROM daily_bookings WHERE month=$1",
    [req.params.month]
  );
  res.json(r.rows);
});

/* ================= SUMMARY ================= */
app.post("/summary", async (req, res) => {
  const { employeeId, pre, off, rep, app } = req.body;
  await db.query(`
    INSERT INTO lead_summary(employee_id, pre, off, rep, app)
    VALUES($1,$2,$3,$4,$5)
    ON CONFLICT (employee_id)
    DO UPDATE SET
      pre=$2, off=$3, rep=$4, app=$5
  `,[employeeId, pre, off, rep, app]);
  res.sendStatus(200);
});

app.get("/summary", async (req, res) => {
  const r = await db.query("SELECT * FROM lead_summary");
  res.json(r.rows);
});

/* ================= MONTHLY AUTO-CALC ================= */
app.post("/recalc-monthly", async (req, res) => {
  await db.query(`
    INSERT INTO monthly_leads(employee_id, month, total)
    SELECT employee_id, month, SUM(value)
    FROM daily_bookings
    GROUP BY employee_id, month
    ON CONFLICT (employee_id, month)
    DO UPDATE SET total=EXCLUDED.total
  `);
  res.sendStatus(200);
});

/* ================= BATCH ================= */
app.post("/batch", async (req, res) => {
  const { employeeId, batchId, value } = req.body;
  await db.query(`
    INSERT INTO batch_leads(employee_id, batch_id, value)
    VALUES($1,$2,$3)
    ON CONFLICT (employee_id, batch_id)
    DO UPDATE SET value=$3
  `,[employeeId, batchId, value]);
  res.sendStatus(200);
});

/* ================= HEALTH ================= */
app.get("/test", async (req, res) => {
  const r = await db.query("SELECT NOW()");
  res.json(r.rows[0]);
});

app.listen(process.env.PORT, () =>
  console.log("🚀 Backend running on port", process.env.PORT)
);
