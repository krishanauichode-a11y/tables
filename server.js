// --- Dependencies ---
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const path = require('path');

// --- App Initialization ---
const app = express();
const port = process.env.PORT || 3000;

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Initialize Supabase client
const supabaseUrl = 'https://ihyogsvmprdwubfqhzls.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImloeW9nc3ZtcHJkd3ViZnFoemxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxODk3NjMsImV4cCI6MjA4NTc2NTc2M30.uudrEHr5d5ntqfB3p8aRusRwE3cI5bh65sxt7BF2yQU';
const supabase = createClient(supabaseUrl, supabaseKey);

// ================= 6 NEW COLUMNS FOR 4TH CAROUSEL =================
const ADDITIONAL_BATCH_COLUMNS = [
  "18 August - Pune",
  "6 September - Hindi",
  "30 September - Hindi Basic Online",
  "2 October - Hindi Advance Online",
  "24th November - Pune",
  "15 December - Pune"
];

const OLD_PLACEHOLDER_COLUMNS = ["NEW COL 1", "NEW COL 2", "NEW COL 3", "NEW COL 4", "NEW COL 5", "NEW COL 6", "NEW COL 7"];

async function cleanupOldPlaceholderBatches() {
  try {
    for (const colName of OLD_PLACEHOLDER_COLUMNS) {
      const batchId = 'new_col_' + colName.replace(/\s+/g, '_').toLowerCase();

      const { error: deleteLeadsError } = await supabase
        .from('batch_leads')
        .delete()
        .eq('batch_id', batchId);

      if (deleteLeadsError) {
        console.warn('>>> [cleanupOldPlaceholderBatches] Warning deleting leads for "' + colName + '":', deleteLeadsError.message);
      }

      const { data: deleted, error: deleteError } = await supabase
        .from('batches')
        .delete()
        .eq('id', batchId)
        .select();

      if (deleteError) {
        console.warn('>>> [cleanupOldPlaceholderBatches] Warning deleting "' + colName + '":', deleteError.message);
      } else if (deleted && deleted.length > 0) {
        console.log('>>> [cleanupOldPlaceholderBatches] Removed old batch: "' + colName + '"');
      }
    }
  } catch (error) {
    console.error('>>> [cleanupOldPlaceholderBatches] Error:', error.message);
  }
}

async function ensureAdditionalBatches() {
  try {
    await cleanupOldPlaceholderBatches();

    for (const colName of ADDITIONAL_BATCH_COLUMNS) {
      const { data: existing, error: checkError } = await supabase
        .from('batches')
        .select('id')
        .eq('label', colName)
        .maybeSingle();

      if (checkError) {
        console.warn('>>> [ensureAdditionalBatches] Warning checking "' + colName + '":', checkError.message);
        continue;
      }

      if (!existing) {
        const batchId = 'new_col_' + colName.replace(/\s+/g, '_').toLowerCase();
        const { data: inserted, error: insertError } = await supabase
          .from('batches')
          .insert({ id: batchId, label: colName, thc: 0 })
          .select()
          .single();

        if (insertError) {
          console.warn('>>> [ensureAdditionalBatches] Warning inserting "' + colName + '":', insertError.message);
        } else {
          console.log('>>> [ensureAdditionalBatches] Created batch: "' + colName + '" with id: ' + batchId);
        }
      } else {
        console.log('>>> [ensureAdditionalBatches] Batch already exists: "' + colName + '"');
      }
    }
  } catch (error) {
    console.error('>>> [ensureAdditionalBatches] Error:', error.message);
  }
}
// ================= END 6 NEW COLUMNS =================

// --- Helper: Safe delete all rows from a table ---
async function safeDeleteAll(table) {
  const { error } = await supabase.from(table).delete().gt('id', 0);
  if (error) throw error;
}

// --- Helper: Safe insert with chunking (Supabase limit ~500 rows) ---
async function safeInsert(table, data) {
  if (!data || data.length === 0) return;
  const CHUNK = 400;
  for (let i = 0; i < data.length; i += CHUNK) {
    const chunk = data.slice(i, i + CHUNK);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw error;
  }
}

// ======================== API ROUTES ========================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get ALL sales data
app.get('/api/sales', async (req, res) => {
  try {
    console.log(">>> [DEBUG] Fetching data from Supabase...");

    await ensureAdditionalBatches();

    const [
      { data: employees, error: empError },
      { data: dailyBookings, error: dailyError },
      { data: leadSummary, error: summaryError },
      { data: monthlyLeads, error: monthlyError },
      { data: batchLeads, error: batchError },
      { data: batches, error: batchesError },
      { data: monthlyBatchAdmin, error: batchAdminError },
      { data: customHeaders, error: headersError },
      { data: webinarLeads, error: webinarError },
      { data: employeeBatches, error: empBatchesError },
      { data: batchMonthMapping, error: batchMappingError },
      { data: webinarData, error: webinarDataError },
      { data: webinarPerformanceData, error: webinarPerfError },
      { data: dailyWebinarPerformance, error: dailyWebinarPerfError }
    ] = await Promise.all([
      supabase.from('employees').select('*'),
      supabase.from('daily_bookings').select('*'),
      supabase.from('lead_summary').select('*'),
      supabase.from('monthly_leads').select('*'),
      supabase.from('batch_leads').select('*'),
      supabase.from('batches').select('*'),
      supabase.from('monthly_batch_admin_leads').select('*'),
      supabase.from('custom_headers').select('*'),
      supabase.from('webinar_leads').select('*'),
      supabase.from('employee_batches').select('*'),
      supabase.from('batch_month_mapping').select('*').order('batch_index'),
      supabase.from('webinar_data').select('*'),
      supabase.from('webinar_performance').select('*'),
      supabase.from('daily_webinar_performance').select('*')
    ]);

    if (empError) throw empError;
    if (dailyError) throw dailyError;
    if (summaryError) throw summaryError;
    if (monthlyError) throw monthlyError;
    if (batchError) throw batchError;
    if (batchesError) throw batchesError;
    if (batchAdminError) throw batchAdminError;
    if (headersError) throw headersError;
    if (webinarError) throw webinarError;
    if (empBatchesError) throw empBatchesError;
    if (batchMappingError) throw batchMappingError;
    if (webinarDataError) throw webinarDataError;
    if (webinarPerfError) throw webinarPerfError;
    if (dailyWebinarPerfError) throw dailyWebinarPerfError;

    console.log(">>> [DEBUG] Data fetched. Formatting for frontend.");

    const formattedData = {
      employees: employees.map(e => e.name),
      employeeOrder: null,
      dailyBookings: {},
      dailyBookingsByYear: {},
      leadSummary: {},
      monthlyLeads: {},
      monthlyLeadsByYear: {},
      batchData: { employees: employees.map(e => e.name), batches: batches, batchLeads: {}, thc: {} },
      monthlyBatchAdmin: {},
      customHeaders: {
        daily: [],
        summary: ["Team Member", "Fresher", "Offer", "Repeater", "Family", "Basic", "Advance", "TOTAL", "Attended", "Postponed"],
        monthly: ["Team Member"],
        batch: ["Team Member"],
        batchTable: ["Team Member"]
      },
      webinarLeads: {},
      employeeBatches: {},
      batchToMonthMapping: [],
      webinarData: {},
      webinarPerformanceData: {},
      webinarDailyData: {}
    };

    // Process batch-to-month mappings
    if (batchMonthMapping && batchMonthMapping.length > 0) {
      formattedData.batchToMonthMapping = batchMonthMapping.map(mapping => ({
        batchIndex: mapping.batch_index,
        batchName: mapping.batch_name,
        monthIndex: mapping.month_index,
        monthName: mapping.month_name,
        year: mapping.year || "2026"
      }));
    }

    // Process employee batches
    employees.forEach(emp => {
      const batchAssignment = employeeBatches.find(b => b.employee_id === emp.id);
      formattedData.employeeBatches[emp.name] = batchAssignment ? batchAssignment.batch_id : null;
    });

    // Process custom headers
    if (customHeaders && customHeaders.length > 0) {
      customHeaders.forEach(header => {
        if (header.table_name === '_employeeOrder') {
          formattedData.employeeOrder = header.headers;
        } else if (header.table_name && header.headers) {
          formattedData.customHeaders[header.table_name] = header.headers;
        }
      });
    }

    // Process daily bookings
    employees.forEach(emp => {
      formattedData.dailyBookings[emp.name] = {};
      formattedData.dailyBookingsByYear[emp.name] = {};

      const empDailyBookings = dailyBookings.filter(d => d.employee_id === emp.id);
      empDailyBookings.forEach(booking => {
        const year = String(booking.year || "2026");

        if (!formattedData.dailyBookings[emp.name][booking.month]) {
          formattedData.dailyBookings[emp.name][booking.month] = {};
        }
        formattedData.dailyBookings[emp.name][booking.month][booking.day] = booking.value;

        if (!formattedData.dailyBookingsByYear[emp.name][year]) {
          formattedData.dailyBookingsByYear[emp.name][year] = {};
        }
        if (!formattedData.dailyBookingsByYear[emp.name][year][booking.month]) {
          formattedData.dailyBookingsByYear[emp.name][year][booking.month] = {};
        }
        formattedData.dailyBookingsByYear[emp.name][year][booking.month][booking.day] = booking.value;
      });
    });

    // Process lead summary
    employees.forEach(emp => {
      formattedData.leadSummary[emp.name] = {};
      for (let month = 0; month < 12; month++) {
        formattedData.leadSummary[emp.name][month] = { pre: 0, off: 0, rep: 0, app: 0, bas: 0, adv: 0, att: 0 };
      }
      const empSummary = leadSummary.filter(s => s.employee_id === emp.id);
      empSummary.forEach(summary => {
        formattedData.leadSummary[emp.name][summary.month] = {
          pre: summary.fre || 0,
          off: summary.off || 0,
          rep: summary.rep || 0,
          app: summary.fam || 0,
          bas: summary.bas || 0,
          adv: summary.adv || 0,
          att: summary.att || 0
        };
      });
    });

    // Process monthly leads
    employees.forEach(emp => {
      const empMonthly = monthlyLeads.filter(m => m.employee_id === emp.id);
      formattedData.monthlyLeads[emp.name] = Array(12).fill(0);
      formattedData.monthlyLeadsByYear[emp.name] = {};

      empMonthly.forEach(month => {
        const year = String(month.year || "2026");
        formattedData.monthlyLeads[emp.name][month.month] = month.value;
        if (!formattedData.monthlyLeadsByYear[emp.name][year]) {
          formattedData.monthlyLeadsByYear[emp.name][year] = Array(12).fill(0);
        }
        formattedData.monthlyLeadsByYear[emp.name][year][month.month] = month.value;
      });
    });

    // Process batch data
    employees.forEach(emp => {
      formattedData.batchData.batchLeads[emp.name] = {};
      batches.forEach(batch => {
        const batchLead = batchLeads.find(bl => bl.employee_id === emp.id && bl.batch_id === batch.id);
        formattedData.batchData.batchLeads[emp.name][batch.id] = batchLead ? batchLead.value : 0;
      });
    });
    batches.forEach(b => {
      formattedData.batchData.thc[b.id] = b.thc || 0;
    });

    // Process monthly batch admin
    employees.forEach(emp => {
      const adminData = monthlyBatchAdmin.find(m => m.employee_id === emp.id);
      if (adminData) {
        formattedData.monthlyBatchAdmin[emp.name] = [
          adminData.lead_10_jul, adminData.lead_29_jul, adminData.lead_jul,
          adminData.lead_19_aug, adminData.lead_aug, adminData.lead_16_sep,
          adminData.lead_sep, adminData.lead_13_oct, adminData.lead_oct,
          adminData.lead_nov, adminData.lead_dec, adminData.lead_jan,
          adminData.lead_10_nov, adminData.lead_20_nov, adminData.lead_14_dec
        ];
      } else {
        formattedData.monthlyBatchAdmin[emp.name] = Array(15).fill(0);
      }
    });

    // Process webinar leads
    formattedData.webinarLeads = {};
    if (webinarLeads && webinarLeads.length > 0) {
      webinarLeads.forEach(item => {
        const year = String(item.year || "2026");
        if (!formattedData.webinarLeads[year]) {
          formattedData.webinarLeads[year] = {};
        }
        formattedData.webinarLeads[year][item.month] = item.lead_count;
      });
    }

    // Process webinar batch data
    formattedData.webinarData = {};
    if (webinarData && webinarData.length > 0) {
      webinarData.forEach(item => {
        const year = String(item.year || "2026");
        if (!formattedData.webinarData[year]) {
          formattedData.webinarData[year] = {};
        }
        formattedData.webinarData[year][item.batch_name] = item.lead_count;
      });
    }

    // Process Webinar Performance Data
    if (webinarPerformanceData && webinarPerformanceData.length > 0) {
      webinarPerformanceData.forEach(item => {
        const empObj = employees.find(e => e.id === item.employee_id);
        const empName = empObj ? empObj.name : item.employee_name;

        if (empName) {
          const year = String(item.year || "2026");
          if (!formattedData.webinarPerformanceData[year]) {
            formattedData.webinarPerformanceData[year] = {};
          }
          if (!formattedData.webinarPerformanceData[year][empName]) {
            formattedData.webinarPerformanceData[year][empName] = Array(12).fill(0);
          }
          formattedData.webinarPerformanceData[year][empName][item.month] = item.lead_count;
        }
      });
    }

    // Process Daily Webinar Performance Data
    formattedData.webinarDailyData = {};
    employees.forEach(emp => {
      const empDailyWebinar = dailyWebinarPerformance.filter(d => d.employee_id === emp.id);
      empDailyWebinar.forEach(entry => {
        const year = String(entry.year || "2026");
        if (!formattedData.webinarDailyData[year]) {
          formattedData.webinarDailyData[year] = {};
        }
        if (!formattedData.webinarDailyData[year][emp.name]) {
          formattedData.webinarDailyData[year][emp.name] = {};
        }
        if (!formattedData.webinarDailyData[year][emp.name][entry.month]) {
          formattedData.webinarDailyData[year][emp.name][entry.month] = {};
        }
        formattedData.webinarDailyData[year][emp.name][entry.month][entry.day] = entry.value;
      });
    });

    console.log(">>> [DEBUG] Data formatted. Sending response. Employees: " + formattedData.employees.length + ", Batches: " + batches.length);
    res.json(formattedData);

  } catch (error) {
    console.error('!!! [DEBUG] ERROR IN /api/sales GET !!!', error);
    res.status(500).json({ error: 'Failed to fetch sales data', details: error.message });
  }
});

// ======================== SAVE ALL DATA — RESILIENT VERSION ========================
app.post('/api/sales', async (req, res) => {
  const errors = [];

  try {
    const {
      employees, employeeOrder, dailyBookings, dailyBookingsByYear,
      leadSummary, monthlyLeads, monthlyLeadsByYear, batchData,
      monthlyBatchAdmin, customHeaders, webinarLeads, employeeBatches,
      batchToMonthMapping, webinarData, webinarPerformanceData, webinarDailyData
    } = req.body;

    console.log(">>> [SAVE] Received save request. Employees:", employees ? employees.length : 0);

    if (!employees || employees.length === 0) {
      return res.status(400).json({ error: "No employees provided in payload" });
    }

    // ===== Step 1: Ensure all employees exist, build ID map =====
    const empIdMap = {};
    for (const empName of employees) {
      try {
        const { data: existingEmp, error: findError } = await supabase
          .from('employees')
          .select('id')
          .eq('name', empName)
          .single();

        if (findError && findError.code !== 'PGRST116') {
          console.warn(">>> [SAVE] Warning finding employee '" + empName + "':", findError.message);
        }

        if (existingEmp) {
          empIdMap[empName] = existingEmp.id;
        } else {
          const { data: newEmp, error: insertError } = await supabase
            .from('employees')
            .insert({ name: empName })
            .select('id')
            .single();

          if (insertError) {
            // If duplicate, try to fetch it again
            if (insertError.code === '23505') {
              const { data: retryEmp } = await supabase
                .from('employees')
                .select('id')
                .eq('name', empName)
                .single();
              if (retryEmp) {
                empIdMap[empName] = retryEmp.id;
              } else {
                errors.push("Employee '" + empName + "': " + insertError.message);
              }
            } else {
              errors.push("Employee '" + empName + "': " + insertError.message);
            }
          } else {
            empIdMap[empName] = newEmp.id;
          }
        }
      } catch (err) {
        console.error(">>> [SAVE] Error ensuring employee '" + empName + "':", err.message);
        errors.push("Employee '" + empName + "': " + err.message);
      }
    }

    const employeeIds = Object.values(empIdMap);
    if (employeeIds.length === 0) {
      return res.status(400).json({ error: "No valid employees could be resolved", details: errors });
    }

    console.log(">>> [SAVE] Resolved " + employeeIds.length + " employee IDs.");

    // ===== Step 2: Save Daily Bookings =====
    try {
      const dailyBookingsToInsert = [];

      if (dailyBookings) {
        for (const empName in dailyBookings) {
          const empId = empIdMap[empName];
          if (!empId) continue;
          for (const month in dailyBookings[empName]) {
            for (const day in dailyBookings[empName][month]) {
              dailyBookingsToInsert.push({
                employee_id: empId,
                month: parseInt(month),
                day: parseInt(day),
                value: dailyBookings[empName][month][day],
                year: "2026"
              });
            }
          }
        }
      }

      if (dailyBookingsByYear) {
        for (const empName in dailyBookingsByYear) {
          const empId = empIdMap[empName];
          if (!empId) continue;
          for (const year in dailyBookingsByYear[empName]) {
            for (const month in dailyBookingsByYear[empName][year]) {
              for (const day in dailyBookingsByYear[empName][year][month]) {
                dailyBookingsToInsert.push({
                  employee_id: empId,
                  month: parseInt(month),
                  day: parseInt(day),
                  value: dailyBookingsByYear[empName][year][month][day],
                  year: String(year)
                });
              }
            }
          }
        }
      }

      // Delete existing daily bookings for these employees, then insert fresh
      if (employeeIds.length > 0) {
        await supabase.from('daily_bookings').delete().in('employee_id', employeeIds);
      }
      if (dailyBookingsToInsert.length > 0) {
        await safeInsert('daily_bookings', dailyBookingsToInsert);
      }
      console.log(">>> [SAVE] Step 2 done: Daily bookings saved (" + dailyBookingsToInsert.length + " rows)");
    } catch (err) {
      console.error(">>> [SAVE] Step 2 FAILED — Daily bookings:", err.message);
      errors.push("Daily bookings: " + err.message);
    }

    // ===== Step 3: Save Lead Summary =====
    try {
      const leadSummaryToInsert = [];
      for (const empName in leadSummary) {
        const empId = empIdMap[empName];
        if (!empId) continue;
        const monthlySummary = leadSummary[empName];
        if (typeof monthlySummary === 'object' && monthlySummary !== null) {
          for (const monthKey in monthlySummary) {
            const month = parseInt(monthKey, 10);
            if (isNaN(month)) continue;
            const s = monthlySummary[monthKey];
            leadSummaryToInsert.push({
              employee_id: empId,
              month: month,
              fre: s.pre || 0,
              off: s.off || 0,
              rep: s.rep || 0,
              fam: s.app || 0,
              bas: s.bas || 0,
              adv: s.adv || 0,
              att: s.att || 0
            });
          }
        }
      }
      if (employeeIds.length > 0) {
        await supabase.from('lead_summary').delete().in('employee_id', employeeIds);
      }
      if (leadSummaryToInsert.length > 0) {
        await safeInsert('lead_summary', leadSummaryToInsert);
      }
      console.log(">>> [SAVE] Step 3 done: Lead summary saved (" + leadSummaryToInsert.length + " rows)");
    } catch (err) {
      console.error(">>> [SAVE] Step 3 FAILED — Lead summary:", err.message);
      errors.push("Lead summary: " + err.message);
    }

    // ===== Step 4: Save Monthly Leads =====
    try {
      const monthlyLeadsToInsert = [];

      if (monthlyLeads) {
        for (const empName in monthlyLeads) {
          const empId = empIdMap[empName];
          if (!empId) continue;
          for (let month = 0; month < 12; month++) {
            monthlyLeadsToInsert.push({
              employee_id: empId,
              month: month,
              value: monthlyLeads[empName][month] || 0,
              year: "2026"
            });
          }
        }
      }

      if (monthlyLeadsByYear) {
        for (const empName in monthlyLeadsByYear) {
          const empId = empIdMap[empName];
          if (!empId) continue;
          for (const year in monthlyLeadsByYear[empName]) {
            for (let month = 0; month < 12; month++) {
              monthlyLeadsToInsert.push({
                employee_id: empId,
                month: month,
                value: monthlyLeadsByYear[empName][year][month] || 0,
                year: String(year)
              });
            }
          }
        }
      }

      if (employeeIds.length > 0) {
        await supabase.from('monthly_leads').delete().in('employee_id', employeeIds);
      }
      if (monthlyLeadsToInsert.length > 0) {
        await safeInsert('monthly_leads', monthlyLeadsToInsert);
      }
      console.log(">>> [SAVE] Step 4 done: Monthly leads saved (" + monthlyLeadsToInsert.length + " rows)");
    } catch (err) {
      console.error(">>> [SAVE] Step 4 FAILED — Monthly leads:", err.message);
      errors.push("Monthly leads: " + err.message);
    }

    // ===== Step 5: Save Batch Data =====
    try {
      if (batchData && batchData.batches) {
        // Save batches (delete all then re-insert to avoid constraint issues)
        await safeDeleteAll('batches');

        const batchesToInsert = batchData.batches.map(b => ({
          id: b.id,
          label: b.label,
          thc: (batchData.thc && batchData.thc[b.id]) || 0
        }));
        if (batchesToInsert.length > 0) {
          await safeInsert('batches', batchesToInsert);
        }

        // Save batch leads
        await safeDeleteAll('batch_leads');

        const batchLeadsToInsert = [];
        for (const empName in batchData.batchLeads) {
          const empId = empIdMap[empName];
          if (!empId) continue;
          for (const batchId in batchData.batchLeads[empName]) {
            batchLeadsToInsert.push({
              employee_id: empId,
              batch_id: batchId,
              value: batchData.batchLeads[empName][batchId] || 0
            });
          }
        }
        if (batchLeadsToInsert.length > 0) {
          await safeInsert('batch_leads', batchLeadsToInsert);
        }
        console.log(">>> [SAVE] Step 5 done: Batch data saved (" + batchesToInsert.length + " batches, " + batchLeadsToInsert.length + " leads)");
      }
    } catch (err) {
      console.error(">>> [SAVE] Step 5 FAILED — Batch data:", err.message);
      errors.push("Batch data: " + err.message);
    }

    // ===== Step 6: Save Custom Headers =====
    try {
      if (customHeaders) {
        await safeDeleteAll('custom_headers');

        const headersToInsert = [];
        for (const tableName in customHeaders) {
          if (tableName === '_employeeOrder') continue; // handled below
          headersToInsert.push({ table_name: tableName, headers: customHeaders[tableName] });
        }

        // Save employee order as a special custom header row
        if (employeeOrder && Array.isArray(employeeOrder)) {
          headersToInsert.push({ table_name: '_employeeOrder', headers: employeeOrder });
          console.log(">>> [SAVE] Employee order saved: " + JSON.stringify(employeeOrder));
        }

        if (headersToInsert.length > 0) {
          await safeInsert('custom_headers', headersToInsert);
        }
        console.log(">>> [SAVE] Step 6 done: Custom headers saved (" + headersToInsert.length + " entries)");
      }
    } catch (err) {
      console.error(">>> [SAVE] Step 6 FAILED — Custom headers:", err.message);
      errors.push("Custom headers: " + err.message);
    }

    // ===== Step 7: Save Monthly Batch Admin =====
    try {
      if (monthlyBatchAdmin && Object.keys(monthlyBatchAdmin).length > 0) {
        if (employeeIds.length > 0) {
          await supabase.from('monthly_batch_admin_leads').delete().in('employee_id', employeeIds);
        }
        const adminDataToInsert = [];
        for (const empName in monthlyBatchAdmin) {
          const empId = empIdMap[empName];
          if (!empId) continue;
          const l = monthlyBatchAdmin[empName];
          adminDataToInsert.push({
            employee_id: empId,
            lead_10_jul: l[0] || 0,
            lead_29_jul: l[1] || 0,
            lead_jul: l[2] || 0,
            lead_19_aug: l[3] || 0,
            lead_aug: l[4] || 0,
            lead_16_sep: l[5] || 0,
            lead_sep: l[6] || 0,
            lead_13_oct: l[7] || 0,
            lead_oct: l[8] || 0,
            lead_nov: l[9] || 0,
            lead_dec: l[10] || 0,
            lead_jan: l[11] || 0,
            lead_10_nov: l[12] || 0,
            lead_20_nov: l[13] || 0,
            lead_14_dec: l[14] || 0
          });
        }
        if (adminDataToInsert.length > 0) {
          await safeInsert('monthly_batch_admin_leads', adminDataToInsert);
        }
        console.log(">>> [SAVE] Step 7 done: Monthly batch admin saved (" + adminDataToInsert.length + " rows)");
      }
    } catch (err) {
      console.error(">>> [SAVE] Step 7 FAILED — Monthly batch admin:", err.message);
      errors.push("Monthly batch admin: " + err.message);
    }

    // ===== Step 8: Save Webinar Leads =====
    try {
      if (webinarLeads) {
        const yearsToUpdate = Object.keys(webinarLeads);
        for (const year of yearsToUpdate) {
          await supabase.from('webinar_leads').delete().eq('year', String(year));
        }
        const toInsert = [];
        for (const year in webinarLeads) {
          for (const month in webinarLeads[year]) {
            toInsert.push({
              year: String(year),
              month: parseInt(month),
              lead_count: webinarLeads[year][month]
            });
          }
        }
        if (toInsert.length > 0) {
          await safeInsert('webinar_leads', toInsert);
        }
        console.log(">>> [SAVE] Step 8 done: Webinar leads saved (" + toInsert.length + " rows)");
      }
    } catch (err) {
      console.error(">>> [SAVE] Step 8 FAILED — Webinar leads:", err.message);
      errors.push("Webinar leads: " + err.message);
    }

    // ===== Step 9: Save Employee Batches =====
    try {
      if (employeeBatches) {
        await safeDeleteAll('employee_batches');
        const assignments = [];
        for (const empName in employeeBatches) {
          const empId = empIdMap[empName];
          if (!empId || !employeeBatches[empName]) continue;
          assignments.push({
            employee_id: empId,
            batch_id: employeeBatches[empName]
          });
        }
        if (assignments.length > 0) {
          await safeInsert('employee_batches', assignments);
        }
        console.log(">>> [SAVE] Step 9 done: Employee batches saved (" + assignments.length + " rows)");
      }
    } catch (err) {
      console.error(">>> [SAVE] Step 9 FAILED — Employee batches:", err.message);
      errors.push("Employee batches: " + err.message);
    }

    // ===== Step 10: Save Batch-Month Mappings =====
    try {
      if (batchToMonthMapping && batchToMonthMapping.length > 0) {
        await safeDeleteAll('batch_month_mapping');
        const mappings = batchToMonthMapping.map(m => ({
          batch_index: m.batchIndex,
          batch_name: m.batchName,
          month_index: m.monthIndex,
          month_name: m.monthName,
          year: String(m.year || "2026")
        }));
        if (mappings.length > 0) {
          await safeInsert('batch_month_mapping', mappings);
        }
        console.log(">>> [SAVE] Step 10 done: Batch-month mappings saved (" + mappings.length + " rows)");
      }
    } catch (err) {
      console.error(">>> [SAVE] Step 10 FAILED — Batch-month mappings:", err.message);
      errors.push("Batch-month mappings: " + err.message);
    }

    // ===== Step 11: Save Webinar Batch Data =====
    try {
      if (webinarData) {
        await safeDeleteAll('webinar_data');
        const toInsert = [];
        for (const year in webinarData) {
          for (const batchName in webinarData[year]) {
            toInsert.push({
              year: String(year),
              batch_name: batchName,
              lead_count: webinarData[year][batchName]
            });
          }
        }
        if (toInsert.length > 0) {
          await safeInsert('webinar_data', toInsert);
        }
        console.log(">>> [SAVE] Step 11 done: Webinar batch data saved (" + toInsert.length + " rows)");
      }
    } catch (err) {
      console.error(">>> [SAVE] Step 11 FAILED — Webinar batch data:", err.message);
      errors.push("Webinar batch data: " + err.message);
    }

    // ===== Step 12: Save Webinar Performance Data =====
    try {
      if (webinarPerformanceData) {
        if (employeeIds.length > 0) {
          await supabase.from('webinar_performance').delete().in('employee_id', employeeIds);
        }
        const toInsert = [];
        for (const year in webinarPerformanceData) {
          for (const empName in webinarPerformanceData[year]) {
            const empId = empIdMap[empName];
            if (!empId) continue;
            const monthlyData = webinarPerformanceData[year][empName];
            if (Array.isArray(monthlyData)) {
              monthlyData.forEach((val, monthIndex) => {
                toInsert.push({
                  employee_id: empId,
                  employee_name: empName,
                  year: String(year),
                  month: monthIndex,
                  lead_count: Number(val) || 0
                });
              });
            }
          }
        }
        if (toInsert.length > 0) {
          await safeInsert('webinar_performance', toInsert);
        }
        console.log(">>> [SAVE] Step 12 done: Webinar performance saved (" + toInsert.length + " rows)");
      }
    } catch (err) {
      console.error(">>> [SAVE] Step 12 FAILED — Webinar performance:", err.message);
      errors.push("Webinar performance: " + err.message);
    }

    // ===== Step 13: Save Daily Webinar Performance Data =====
    try {
      if (webinarDailyData) {
        if (employeeIds.length > 0) {
          await supabase.from('daily_webinar_performance').delete().in('employee_id', employeeIds);
        }
        const toInsert = [];
        for (const year in webinarDailyData) {
          for (const empName in webinarDailyData[year]) {
            const empId = empIdMap[empName];
            if (!empId) continue;
            for (const month in webinarDailyData[year][empName]) {
              for (const day in webinarDailyData[year][empName][month]) {
                toInsert.push({
                  employee_id: empId,
                  year: parseInt(year),
                  month: parseInt(month),
                  day: parseInt(day),
                  value: webinarDailyData[year][empName][month][day]
                });
              }
            }
          }
        }
        if (toInsert.length > 0) {
          await safeInsert('daily_webinar_performance', toInsert);
        }
        console.log(">>> [SAVE] Step 13 done: Daily webinar performance saved (" + toInsert.length + " rows)");
      }
    } catch (err) {
      console.error(">>> [SAVE] Step 13 FAILED — Daily webinar performance:", err.message);
      errors.push("Daily webinar performance: " + err.message);
    }

    // ===== Final Response =====
    console.log(">>> [SAVE] ==========================================");
    console.log(">>> [SAVE] ALL SAVE OPERATIONS COMPLETED.");
    if (errors.length > 0) {
      console.warn(">>> [SAVE] PARTIAL FAILURES (" + errors.length + "):", errors);
    } else {
      console.log(">>> [SAVE] ALL 13 STEPS SUCCEEDED WITH ZERO ERRORS.");
    }
    console.log(">>> [SAVE] ==========================================");

    if (errors.length > 0) {
      res.status(207).json({
        success: true,
        warnings: errors,
        message: "Saved with " + errors.length + " partial failure(s). Check server logs."
      });
    } else {
      res.json({ success: true, message: "All data saved successfully" });
    }

  } catch (error) {
    console.error('!!! [SAVE] FATAL UNHANDLED ERROR !!!', error);
    res.status(500).json({
      error: 'Failed to save sales data',
      details: error.message,
      errors: errors
    });
  }
});

// ======================== ADD NEW EMPLOYEE ========================
app.post('/api/employee', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Employee name is required' });

    const { data, error } = await supabase
      .from('employees')
      .insert({ name: name.trim() })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Employee with this name already exists' });
      }
      throw error;
    }
    res.json({ success: true, employee: data });
  } catch (error) {
    console.error('Error adding employee:', error);
    res.status(500).json({ error: 'Failed to add employee', details: error.message });
  }
});

// ======================== REMOVE EMPLOYEE ========================
app.delete('/api/employee/:name', async (req, res) => {
  try {
    const { name } = req.params;

    if (!name) {
      return res.status(400).json({ error: 'Employee name is required' });
    }

    // Check if employee exists
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('id')
      .eq('name', name)
      .single();

    if (empError || !employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const employeeId = employee.id;

    // Remove from employee order list
    const { data: orderRow } = await supabase
      .from('custom_headers')
      .select('id, headers')
      .eq('table_name', '_employeeOrder')
      .single();

    if (orderRow && orderRow.headers && Array.isArray(orderRow.headers)) {
      const updatedOrder = orderRow.headers.filter(emp => emp !== name);
      await supabase
        .from('custom_headers')
        .update({ headers: updatedOrder })
        .eq('id', orderRow.id);
      console.log('>>> [DEBUG] Removed "' + name + '" from employee order.');
    }

    // Remove current batch assignment only
    const { error: batchAssignError } = await supabase
      .from('employee_batches')
      .delete()
      .eq('employee_id', employeeId);

    if (batchAssignError) {
      console.warn(">>> [DEBUG] Warning: Could not remove batch assignment: " + batchAssignError.message);
    } else {
      console.log('>>> [DEBUG] Removed batch assignment for "' + name + '".');
    }

    // Delete the employee record
    const { error: deleteError } = await supabase
      .from('employees')
      .delete()
      .eq('id', employeeId);

    if (deleteError) throw deleteError;

    // Historical data in other tables is PRESERVED (not deleted)

    console.log('>>> [DEBUG] Employee "' + name + '" removed. Historical data preserved.');

    res.json({
      success: true,
      message: 'Employee "' + name + '" removed from active list. All historical data has been preserved.'
    });

  } catch (error) {
    console.error('Error removing employee:', error);
    res.status(500).json({
      error: 'Failed to remove employee',
      details: error.message
    });
  }
});

// ======================== START SERVER ========================
app.listen(port, () => {
  console.log("================================================");
  console.log("  Sales Lead Admin API Server");
  console.log("  Running on http://localhost:" + port);
  console.log("  Supabase connected: " + supabaseUrl);
  console.log("================================================");
});
