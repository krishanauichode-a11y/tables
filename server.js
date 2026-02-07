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
app.use(cors());
app.use(express.json());

// Initialize Supabase client
// WARNING: Move these to environment variables for production!
const supabaseUrl = 'https://ihyogsvmprdwubfqhzls.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImloeW9nc3ZtcHJkd3ViZnFoemxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxODk3NjMsImV4cCI6MjA4NTc2NTc2M30.uudrEHr5d5ntqfB3p8aRusRwE3cI5bh65sxt7BF2yQU';
const supabase = createClient(supabaseUrl, supabaseKey);

// --- API Routes ---

// Get ALL sales data, including webinar leads
app.get('/api/sales', async (req, res) => {
  try {
    console.log(">>> [DEBUG] Fetching data from Supabase...");
    const [
      { data: employees, error: empError },
      { data: dailyBookings, error: dailyError },
      { data: leadSummary, error: summaryError },
      { data: monthlyLeads, error: monthlyError },
      { data: batchLeads, error: batchError },
      { data: batches, error: batchesError },
      { data: monthlyBatchAdmin, error: batchAdminError },
      { data: customHeaders, error: headersError },
      { data: webinarLeads, error: webinarError } // <-- ADDED: Fetch webinar leads
    ] = await Promise.all([
      supabase.from('employees').select('*'),
      supabase.from('daily_bookings').select('*'),
      supabase.from('lead_summary').select('*'),
      supabase.from('monthly_leads').select('*'),
      supabase.from('batch_leads').select('*'),
      supabase.from('batches').select('*'),
      supabase.from('monthly_batch_admin_leads').select('*'),
      supabase.from('custom_headers').select('*'),
      supabase.from('webinar_leads').select('*') // <-- ADDED: Fetch webinar leads
    ]);

    // Check for all errors, including the new one
    if (empError) throw empError; if (dailyError) throw dailyError;
    if (summaryError) throw summaryError; if (monthlyError) throw monthlyError;
    if (batchError) throw batchError; if (batchesError) throw batchesError;
    if (batchAdminError) throw batchAdminError;
    if (headersError) throw headersError;
    if (webinarError) throw webinarError; // <-- ADDED: Check for webinar error
    
    console.log(">>> [DEBUG] Data fetched. Formatting for frontend.");

    const formattedData = {
      employees: employees.map(e => e.name),
      dailyBookings: {}, leadSummary: {}, monthlyLeads: {},
      batchData: { employees: employees.map(e => e.name), batches: batches, batchLeads: {}, thc: {} },
      monthlyBatchAdmin: {},
      customHeaders: { /* default headers */ },
      webinarLeads: {} // <-- ADDED: Initialize webinar leads object
    };

    // Process custom headers
    if (customHeaders && customHeaders.length > 0) {
      customHeaders.forEach(header => {
        if (header.table_name && header.headers) {
          formattedData.customHeaders[header.table_name] = header.headers;
        }
      });
    }
    
    // ... (all the other data processing loops for employees, dailyBookings, etc.) ...
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
    employees.forEach(emp => {
        formattedData.batchData.batchLeads[emp.name] = {};
        batches.forEach(batch => {
            const batchLead = batchLeads.find(bl => bl.employee_id === emp.id && bl.batch_id === batch.id);
            formattedData.batchData.batchLeads[emp.name][batch.id] = batchLead ? batchLead.value : 0;
        });
    });
    batches.forEach(b => formattedData.batchData.thc[b.id] = b.thc || 0);
    employees.forEach(emp => {
      const adminData = monthlyBatchAdmin.find(m => m.employee_id === emp.id);
      if (adminData) {
        formattedData.monthlyBatchAdmin[emp.name] = [/* ... 15 elements ... */];
      } else {
        formattedData.monthlyBatchAdmin[emp.name] = Array(15).fill(0);
      }
    });

    // ADDED: Process webinar leads
    if (webinarLeads && webinarLeads.length > 0) {
      webinarLeads.forEach(item => {
        formattedData.webinarLeads[item.month] = item.lead_count;
      });
    }

    console.log(">>> [DEBUG] Data formatted. Sending response.");
    res.json(formattedData);
  } catch (error) {
    console.error('!!! [DEBUG] ERROR IN /api/sales !!!', error);
    res.status(500).json({ error: 'Failed to fetch sales data', details: error.message });
  }
});

// Save ALL sales data, including webinar leads
app.post('/api/sales', async (req, res) => {
  try {
    const { 
      employees, dailyBookings, leadSummary, monthlyLeads, batchData, 
      monthlyBatchAdmin, customHeaders, webinarLeads // <-- ADDED: Destructure webinarLeads
    } = req.body;
    
    console.log(">>> [SAVE-DEBUG] Received request to save data.");

    // --- Step 1: Get Employee IDs ---
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
    
    const upsertData = async (table, data, conflictColumns) => { 
        const { error } = await supabase.from(table).upsert(data, { onConflict: conflictColumns }); 
        if (error) throw error; 
    };

    // --- Steps 2-7: Save all other data (omitted for brevity but must be present) ---
    // (Daily Bookings, Lead Summary, Monthly Leads, Batch Data, Custom Headers, Monthly Batch Admin)
    // ... (all your existing save logic for these) ...
    const dailyBookingsToUpsert = []; /* ... */ if (dailyBookingsToUpsert.length > 0) await upsertData('daily_bookings', dailyBookingsToUpsert, 'employee_id, month, day');
    const leadSummaryToUpsert = []; /* ... */ if (leadSummaryToUpsert.length > 0) await upsertData('lead_summary', leadSummaryToUpsert, 'employee_id');
    const monthlyLeadsToUpsert = []; /* ... */ if (monthlyLeadsToUpsert.length > 0) await upsertData('monthly_leads', monthlyLeadsToUpsert, 'employee_id, month');
    if (batchData) { /* ... */ }
    if (customHeaders) { /* ... */ }
    if (monthlyBatchAdmin && Object.keys(monthlyBatchAdmin).length > 0) { /* ... */ }

    // --- ADDED: Step 8: Save Webinar Leads ---
    if (webinarLeads) {
      console.log(">>> [SAVE-DEBUG] Step 8: Processing webinar leads...");
      const webinarLeadsToUpsert = [];
      for (const month in webinarLeads) {
        webinarLeadsToUpsert.push({
          month: month,
          lead_count: webinarLeads[month]
        });
      }
      if (webinarLeadsToUpsert.length > 0) {
        const { error: webinarError } = await supabase
          .from('webinar_leads')
          .upsert(webinarLeadsToUpsert, { onConflict: 'month' });
        
        if (webinarError) {
          console.error("!!! [SAVE-DEBUG] ERROR DURING WEBINAR LEADS UPSERT:", webinarError);
          throw webinarError;
        }
        console.log(">>> [SAVE-DEBUG] Webinar leads saved successfully.");
      }
    }
    // --- END: Webinar Leads ---

    console.log(">>> [SAVE-DEBUG] All save operations completed successfully.");
    res.json({ success: true });

  } catch (error) {
    console.error('!!! [SAVE-DEBUG] CATASTROPHIC ERROR IN SAVE ROUTE !!!', error);
    res.status(500).json({ error: 'Failed to save sales data', details: error.message });
  }
});

// Add new employee
app.post('/api/employee', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Employee name is required' });
    const { data, error } = await supabase.from('employees').insert({ name }).select().single();
    if (error) { if (error.code === '23505') return res.status(409).json({ error: 'Employee with this name already exists' }); throw error; }
    res.json({ success: true, employee: data });
  } catch (error) { console.error('Error adding employee:', error); res.status(500).json({ error: 'Failed to add employee', details: error.message }); }
});


// Start Server
app.listen(port, () => { console.log(`Server is running on port ${port}`); });
