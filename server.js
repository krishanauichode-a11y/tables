// server.js

// --- Dependencies ---
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const path = require('path');

// --- App Initialization ---
const app = express();
const port = process.env.PORT || 3000;

// --- Middleware ---
const corsOptions = {
  origin: [
    'https://your-frontend-domain.onrender.com',
    'http://localhost:3000',
    'http://localhost:5173',
  ],
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Supabase Client ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("FATAL ERROR: SUPABASE_URL or SUPABASE_KEY is not set.");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

// --- API Routes ---

// Get all sales data
app.get('/api/sales', async (req, res) => {
  try {
    const [
      { data: employees, error: empError },
      { data: dailyBookings, error: dailyError },
      { data: leadSummary, error: summaryError },
      { data: monthlyLeads, error: monthlyError },
      { data: batchLeads, error: batchError },
      { data: batches, error: batchesError },
      { data: monthlyBatchAdmin, error: batchAdminError } // NEW: Fetch monthly batch admin data
    ] = await Promise.all([
      supabase.from('employees').select('*'),
      supabase.from('daily_bookings').select('*'),
      supabase.from('lead_summary').select('*'),
      supabase.from('monthly_leads').select('*'),
      supabase.from('batch_leads').select('*'),
      supabase.from('batches').select('*'),
      supabase.from('monthly_batch_admin_leads').select('*') // NEW
    ]);

    if (empError) throw empError; if (dailyError) throw dailyError;
    if (summaryError) throw summaryError; if (monthlyError) throw monthlyError;
    if (batchError) throw batchError; if (batchesError) throw batchesError;
    if (batchAdminError) throw batchAdminError;

    const empMap = new Map(employees.map(emp => [emp.id, emp.name]));

    // Format existing data
    const formattedData = {
      employees: employees.map(e => e.name),
      dailyBookings: {}, leadSummary: {}, monthlyLeads: {},
      batchData: {
        employees: employees.map(e => e.name),
        batches: batches, batchLeads: {}, thc: {}
      },
      monthlyBatchAdmin: {} // NEW: Add formatted monthly batch admin data
    };

    // ... (formatting for dailyBookings, leadSummary, monthlyLeads, batchData remains the same)
    employees.forEach(emp => {
      formattedData.dailyBookings[emp.name] = {};
      const empDailyBookings = dailyBookings.filter(d => d.employee_id === emp.id);
      empDailyBookings.forEach(booking => {
        if (!formattedData.dailyBookings[emp.name][booking.month]) formattedData.dailyBookings[emp.name][booking.month] = {};
        formattedData.dailyBookings[emp.name][booking.month][booking.day] = booking.value;
      });
    });
    employees.forEach(emp => {
      const empSummary = leadSummary.find(s => s.employee_id === emp.id);
      formattedData.leadSummary[emp.name] = empSummary ? { pre: empSummary.fre, off: empSummary.off, rep: empSummary.rep, app: empSummary.fam } : { pre: 0, off: 0, rep: 0, app: 0 };
    });
    employees.forEach(emp => {
      const empMonthly = monthlyLeads.filter(m => m.employee_id === emp.id);
      formattedData.monthlyLeads[emp.name] = Array(12).fill(0);
      empMonthly.forEach(month => formattedData.monthlyLeads[emp.name][month.month] = month.value);
    });
    batchData.batches.forEach(b => {
        formattedData.batchData.batchLeads[emp.name] = {};
        batchData.batches.forEach(batch => {
            const batchLead = batchLeads.find(bl => bl.employee_id === emp.id && bl.batch_id === batch.id);
            formattedData.batchData.batchLeads[emp.name][batch.id] = batchLead ? batchLead.value : 0;
        });
    });
    batchData.batches.forEach(b => formattedData.batchData.thc[b.id] = batch.thc || 0);
    
    // NEW: Format monthly batch admin data
    employees.forEach(emp => {
      const adminData = monthlyBatchAdmin.find(m => m.employee_id === emp.id);
      if (adminData) {
        formattedData.monthlyBatchAdmin[emp.name] = [
          adminData.lead_10_jul, adminData.lead_29_jul, adminData.lead_jul,
          adminData.lead_19_aug, adminData.lead_aug, adminData.lead_16_sep,
          adminData.lead_sep, adminData.lead_13_oct, adminData.lead_oct,
          adminData.lead_nov, adminData.lead_dec, adminData.lead_jan
        ];
      } else {
        formattedData.monthlyBatchAdmin[emp.name] = Array(12).fill(0);
      }
    });

    res.json(formattedData);
  } catch (error) {
    console.error('Error fetching sales data:', error);
    res.status(500).json({ error: 'Failed to fetch sales data', details: error.message });
  }
});

// Save all sales data
app.post('/api/sales', async (req, res) => {
  try {
    const { employees, dailyBookings, leadSummary, monthlyLeads, batchData, monthlyBatchAdmin } = req.body;
    
    const empIdMap = {};
    for (const empName of employees) {
      const { data: existingEmp, error: empError } = await supabase.from('employees').select('id').eq('name', empName).single();
      if (empError && empError.code !== 'PGRST116') throw empError;
      if (existingEmp) { empIdMap[empName] = existingEmp.id; }
      else {
        const { data: newEmp, error: insertError } = await supabase.from('employees').insert({ name: empName }).select('id').single();
        if (insertError) throw insertError;
        empIdMap[empName] = newEmp.id;
      }
    }
    
    // (The upsert logic for dailyBookings, leadSummary, monthlyLeads, and batchData remains the same)
    const upsertData = async (table, data) => { const { error } = await supabase.from(table).upsert(data, { onConflict: 'employee_id, month, day, batch_id' }); if (error) throw error; };
    const dailyBookingsToUpsert = []; for (const empName in dailyBookings) { const empId = empIdMap[empName]; if (!empId) continue; for (const month in dailyBookings[empName]) { for (const day in dailyBookings[empName][month]) { dailyBookingsToUpsert.push({ employee_id: empId, month: parseInt(month), day: parseInt(day), value: dailyBookings[empName][month][day] }); } } } if (dailyBookingsToUpsert.length > 0) await upsertData('daily_bookings', dailyBookingsToUpsert);
    const leadSummaryToUpsert = []; for (const empName in leadSummary) { const empId = empIdMap[empName]; if (!empId) continue; const summary = leadSummary[empName]; leadSummaryToUpsert.push({ employee_id: empId, fre: summary.pre, off: summary.off, rep: summary.rep, fam: summary.app }); } } if (leadSummaryToUpsert.length > 0) await upsertData('lead_summary', leadSummaryToUpsert);
    const monthlyLeadsToUpsert = []; for (const empName in monthlyLeads) { const empId = empIdMap[empName]; if (!empId) continue; for (let month = 0; month < 12; month++) { monthlyLeadsToUpsert.push({ employee_id: empId, month: month, value: monthlyLeads[empName][month] }); } } if (monthlyLeadsToUpsert.length > 0) await upsertData('monthly_leads', monthlyLeadsToUpsert);
    if (batchData) { const batchesToUpsert = batchData.batches.map(batch => ({ id: batch.id, label: batch.label, thc: batchData.thc[batch.id] || 0 })); if (batchesToUpsert.length > 0) await upsertData('batches', batchesToUpsert); const batchLeadsToUpsert = []; for (const empName in batchData.batchLeads) { const empId = empIdMap[empName]; if (!empId) continue; for (const batchId in batchData.batchLeads[empName]) { batchLeadsToUpsert.push({ employee_id: empId, batch_id: batchId, value: batchData.batchLeads[empName][batchId] }); } } if (batchLeadsToUpsert.length > 0) await upsertData('batch_leads', batchLeadsToUpsert); }

    // NEW: Save Monthly Batch Admin Data
    if (monthlyBatchAdmin) {
      // First, delete all existing entries for all employees to prevent stale data
      await supabase.from('monthly_batch_admin_leads').delete().in('employee_id', Object.values(empIdMap));

      // Then, insert the new data
      const adminDataToInsert = [];
      for (const empName in monthlyBatchAdmin) {
        const empId = empIdMap[empName];
        if (!empId) continue;
        const leads = monthlyBatchAdmin[empName];
        adminDataToInsert.push({
          employee_id: empId,
          lead_10_jul: leads[0] || 0, lead_29_jul: leads[1] || 0, lead_jul: leads[2] || 0,
          lead_19_aug: leads[3] || 0, lead_aug: leads[4] || 0, lead_16_sep: leads[5] || 0,
          lead_sep: leads[6] || 0, lead_13_oct: leads[7] || 0, lead_oct: leads[8] || 0,
          lead_nov: leads[9] || 0, lead_dec: leads[10] || 0, lead_jan: leads[11] || 0
        });
      }
      if (adminDataToInsert.length > 0) {
        const { error: insertError } = await supabase.from('monthly_batch_admin_leads').insert(adminDataToInsert);
        if (insertError) throw insertError;
      }
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving sales data:', error);
    res.status(500).json({ error: 'Failed to save sales data', details: error.message });
  }
});

// Add new employee
app.post('/api/employee', async (req, res) => {
  try { /* ... (this function remains the same) ... */ 
    const { name } = req.body; if (!name) return res.status(400).json({ error: 'Employee name is required' });
    const { data, error } = await supabase.from('employees').insert({ name }).select().single();
    if (error) { if (error.code === '23505') return res.status(409).json({ error: 'Employee with this name already exists' }); throw error; }
    res.json({ success: true, employee: data });
  } catch (error) { console.error('Error adding employee:', error); res.status(500).json({ error: 'Failed to add employee', details: error.message }); }
});

// Catch-all route
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

// Start Server
app.listen(port, () => { console.log(`Server is running on port ${port}`); });
