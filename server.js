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

// Get all sales data (UPDATED to handle 15 elements and custom headers)
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
      { data: customHeaders, error: headersError }
    ] = await Promise.all([
      supabase.from('employees').select('*'),
      supabase.from('daily_bookings').select('*'),
      supabase.from('lead_summary').select('*'),
      supabase.from('monthly_leads').select('*'),
      supabase.from('batch_leads').select('*'),
      supabase.from('batches').select('*'),
      supabase.from('monthly_batch_admin_leads').select('*'),
      supabase.from('custom_headers').select('*')
    ]);

    if (empError) throw empError; if (dailyError) throw dailyError;
    if (summaryError) throw summaryError; if (monthlyError) throw monthlyError;
    if (batchError) throw batchError; if (batchesError) throw batchesError;
    if (batchAdminError) throw batchAdminError;
    if (headersError) throw headersError;
    
    console.log(">>> [DEBUG] Data fetched. Formatting for frontend.");

    const formattedData = {
      employees: employees.map(e => e.name),
      dailyBookings: {}, leadSummary: {}, monthlyLeads: {},
      batchData: { employees: employees.map(e => e.name), batches: batches, batchLeads: {}, thc: {} },
      monthlyBatchAdmin: {},
      customHeaders: {
        daily: [],
        summary: ["Team Member", "Fresher", "Offline", "Repeater", "Family", "TOTAL"],
        monthly: ["Team Member"],
        batch: ["Team Member"],
        batchTable: ["Team Member"]
      }
    };

    // Process custom headers
    if (customHeaders && customHeaders.length > 0) {
      customHeaders.forEach(header => {
        if (header.table_name && header.headers) {
          formattedData.customHeaders[header.table_name] = header.headers;
        }
      });
    }

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
    
    // UPDATED: Format monthly batch admin data with 15 elements
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

    console.log(">>> [DEBUG] Data formatted. Sending response.");
    res.json(formattedData);
  } catch (error) {
    console.error('!!! [DEBUG] ERROR IN /api/sales !!!', error);
    res.status(500).json({ error: 'Failed to fetch sales data', details: error.message });
  }
});

// Save all sales data (UPDATED to handle 15 elements and custom headers)
app.post('/api/sales', async (req, res) => {
  try {
    const { employees, dailyBookings, leadSummary, monthlyLeads, batchData, monthlyBatchAdmin, customHeaders } = req.body;
    
    console.log(">>> [SAVE-DEBUG] Received request to save data.");
    console.log(">>> [SAVE-DEBUG] monthlyBatchAdmin received:", monthlyBatchAdmin);

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

    // (Other save operations are omitted for brevity, but they should still be here)
    const dailyBookingsToUpsert = [];
    for (const empName in dailyBookings) { const empId = empIdMap[empName]; if (!empId) continue; for (const month in dailyBookings[empName]) { for (const day in dailyBookings[empName][month]) { dailyBookingsToUpsert.push({ employee_id: empId, month: parseInt(month), day: parseInt(day), value: dailyBookings[empName][month][day] }); } } } if (dailyBookingsToUpsert.length > 0) await upsertData('daily_bookings', dailyBookingsToUpsert, 'employee_id, month, day');
    const leadSummaryToUpsert = []; for (const empName in leadSummary) { const empId = empIdMap[empName]; if (!empId) continue; const summary = leadSummary[empName]; leadSummaryToUpsert.push({ employee_id: empId, fre: summary.pre, off: summary.off, rep: summary.rep, fam: summary.app }); } if (leadSummaryToUpsert.length > 0) await upsertData('lead_summary', leadSummaryToUpsert, 'employee_id');
    const monthlyLeadsToUpsert = []; for (const empName in monthlyLeads) { const empId = empIdMap[empName]; if (!empId) continue; for (let month = 0; month < 12; month++) { monthlyLeadsToUpsert.push({ employee_id: empId, month: month, value: monthlyLeads[empName][month] }); } } if (monthlyLeadsToUpsert.length > 0) await upsertData('monthly_leads', monthlyLeadsToUpsert, 'employee_id, month');
    if (batchData) { const batchesToUpsert = batchData.batches.map(batch => ({ id: batch.id, label: batch.label, thc: batchData.thc[batch.id] || 0 })); if (batchesToUpsert.length > 0) await upsertData('batches', batchesToUpsert, 'id'); const batchLeadsToUpsert = []; for (const empName in batchData.batchLeads) { const empId = empIdMap[empName]; if (!empId) continue; for (const batchId in batchData.batchLeads[empName]) { batchLeadsToUpsert.push({ employee_id: empId, batch_id: batchId, value: batchData.batchLeads[emp.name][batchId] }); } } if (batchLeadsToUpsert.length > 0) await upsertData('batch_leads', batchLeadsToUpsert, 'employee_id, batch_id'); }

    // --- START: Save custom headers ---
    if (customHeaders) {
      console.log(">>> [SAVE-DEBUG] Processing custom headers...");
      
      // Delete existing headers
      const { error: deleteHeadersError } = await supabase
        .from('custom_headers')
        .delete()
        .neq('id', 0); // Delete all records
      
      if (deleteHeadersError) {
        console.error("!!! [SAVE-DEBUG] ERROR DURING HEADERS DELETE:", deleteHeadersError);
        throw deleteHeadersError;
      }
      
      // Insert new headers
      const headersToInsert = [];
      for (const tableName in customHeaders) {
        headersToInsert.push({
          table_name: tableName,
          headers: customHeaders[tableName]
        });
      }
      
      if (headersToInsert.length > 0) {
        const { error: insertHeadersError } = await supabase
          .from('custom_headers')
          .insert(headersToInsert);
        
        if (insertHeadersError) {
          console.error("!!! [SAVE-DEBUG] ERROR DURING HEADERS INSERT:", insertHeadersError);
          throw insertHeadersError;
        }
        console.log(">>> [SAVE-DEBUG] Custom headers saved successfully.");
      }
    }
    // --- END: Save custom headers ---

    // --- START: Super-Debug for Monthly Batch Admin ---
    if (monthlyBatchAdmin && monthlyBatchAdmin.length > 0) {
      console.log(">>> [SAVE-DEBUG] Processing monthlyBatchAdmin...");
      const employeeIds = Object.values(empIdMap);
      console.log(">>> [SAVE-DEBUG] Deleting old entries for IDs:", employeeIds);

      const { error: deleteError } = await supabase
        .from('monthly_batch_admin_leads')
        .delete()
        .in('employee_id', employeeIds);
      
      if (deleteError) {
        console.error("!!! [SAVE-DEBUG] ERROR DURING DELETE:", deleteError);
        throw deleteError;
      }
      console.log(">>> [SAVE-DEBUG] Delete successful.");

      const adminDataToInsert = [];
      
      for (const empName in monthlyBatchAdmin) {
        const empId = empIdMap[empName];
        if (!empId) {
          console.log(`>>> [SAVE-DEBUG] Skipping employee ${empName}, ID not found.`);
          continue;
        }
        
        const leads = monthlyBatchAdmin[empName];
        const insertObject = {
          employee_id: empId,
          lead_10_jul: leads[0] || 0, lead_29_jul: leads[1] || 0, lead_jul: leads[2] || 0,
          lead_19_aug: leads[3] || 0, lead_aug: leads[4] || 0, lead_16_sep: leads[5] || 0,
          lead_sep: leads[6] || 0, lead_13_oct: leads[7] || 0, lead_oct: leads[8] || 0,
          lead_nov: leads[9] || 0, lead_dec: leads[10] || 0, lead_jan: leads[11] || 0,
          lead_10_nov: leads[12] || 0, lead_20_nov: leads[13] || 0, lead_14_dec: leads[14] || 0
        };
        console.log(`>>> [SAVE-DEBUG] Preparing to insert for ${empName}:`, insertObject);
        adminDataToInsert.push(insertObject);
      }
      
      if (adminDataToInsert.length > 0) {
        console.log(">>> [SAVE-DEBUG] Inserting new data...");
        const { error: insertError, data } = await supabase
          .from('monthly_batch_admin_leads')
          .insert(adminDataToInsert);
        
        if (insertError) {
          console.error("!!! [SAVE-DEBUG] ERROR DURING INSERT:", insertError);
          throw insertError;
        }
        console.log(">>> [SAVE-DEBUG] Insert successful. Data:", data);
      } else {
        console.log(">>> [SAVE-DEBUG] No new data to insert.");
      }
    } else {
      console.log(">>> [SAVE-DEBUG] monthlyBatchAdmin is empty or not provided.");
    }
    // --- END: Super-Debug ---

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

// ===============================================================
// NEW: API Routes for Webinar Leads (6th Carousel)
// ===============================================================

// GET all webinar leads
app.get('/api/webinar-leads', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('webinar_leads')
      .select('month, lead_count');

    if (error) {
      throw error;
    }

    // Format data into a simple key-value object for the frontend
    const formattedData = {};
    data.forEach(item => {
      formattedData[item.month] = item.lead_count;
    });

    res.json(formattedData);
  } catch (error) {
    console.error('Error fetching webinar leads:', error);
    res.status(500).json({ error: 'Failed to fetch webinar leads', details: error.message });
  }
});

// POST (Create or Update) webinar leads
app.post('/api/webinar-leads', async (req, res) => {
  try {
    const { month, count } = req.body;

    if (!month || count === undefined || count === null) {
      return res.status(400).json({ error: 'Month and count are required.' });
    }

    // Use 'upsert' to either create a new entry or update the existing one for that month
    const { data, error } = await supabase
      .from('webinar_leads')
      .upsert(
        { month: month, lead_count: count },
        { onConflict: 'month' } // If a row with the same 'month' exists, update it.
      )
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json({ success: true, data: data });
  } catch (error) {
    console.error('Error saving webinar leads:', error);
    res.status(500).json({ error: 'Failed to save webinar leads', details: error.message });
  }
});


// Start Server
app.listen(port, () => { console.log(`Server is running on port ${port}`); });
