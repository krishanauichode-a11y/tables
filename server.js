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

// Initialize Supabase client with environment variables
// IMPORTANT: Create a .env file in the same directory with your SUPABASE_URL and SUPABASE_KEY
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
if (!supabaseUrl || !supabaseKey) {
    console.error('!!! FATAL ERROR: SUPABASE_URL and SUPABASE_KEY must be set in .env file !!!');
    process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

// --- API Routes ---

// Get ALL sales data, including webinar leads and custom headers
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
      { data: webinarLeads, error: webinarError },
      { data: employeeBatches, error: empBatchesError } // Fetch employee batches
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
      supabase.from('employee_batches').select('*') // New table
    ]);

    // Check for all errors
    if (empError) throw empError; if (dailyError) throw dailyError;
    if (summaryError) throw summaryError; if (monthlyError) throw monthlyError;
    if (batchError) throw batchError; if (batchesError) throw batchesError;
    if (batchAdminError) throw batchAdminError;
    if (headersError) throw headersError;
    if (webinarError) throw webinarError;
    if (empBatchesError) throw empBatchesError;
    
    console.log(">>> [DEBUG] Data fetched. Formatting for frontend.");

    const formattedData = {
      employees: employees.map(e => e.name),
      dailyBookings: {}, 
      leadSummary: {},
      monthlyLeads: {},
      batchData: { employees: employees.map(e => e.name), batches: batches, batchLeads: {}, thc: {} },
      monthlyBatchAdmin: {},
      customHeaders: {
        daily: [], summary: ["Team Member", "Fresher", "Offline", "Repeater", "Family", "TOTAL"], monthly: ["Team Member"], batch: ["Team Member"], batchTable: ["Team Member"]
      },
      webinarLeads: {},
      employeeBatches: {} // Add employee batches to the response
    };

    // Process employee batches
    employees.forEach(emp => {
        const batchAssignment = employeeBatches.find(b => b.employee_id === emp.id);
        formattedData.employeeBatches[emp.name] = batchAssignment ? batchAssignment.batch_id : null;
    });

    // Process custom headers
    if (customHeaders && customHeaders.length > 0) {
      customHeaders.forEach(header => {
        if (header.table_name && header.headers) {
          formattedData.customHeaders[header.table_name] = header.headers;
        }
      });
    }

    // Process daily bookings
    employees.forEach(emp => {
      formattedData.dailyBookings[emp.name] = {};
      const empDailyBookings = dailyBookings.filter(d => d.employee_id === emp.id);
      empDailyBookings.forEach(booking => {
        if (!formattedData.dailyBookings[emp.name][booking.month]) formattedData.dailyBookings[emp.name][booking.month] = {};
        formattedData.dailyBookings[emp.name][booking.month][booking.day] = booking.value;
      });
    });
    
    // Process lead summary - now month-wise
    employees.forEach(emp => {
      formattedData.leadSummary[emp.name] = {};
      for (let month = 0; month < 12; month++) {
        formattedData.leadSummary[emp.name][month] = { pre: 0, off: 0, rep: 0, app: 0 };
      }
      const empSummary = leadSummary.filter(s => s.employee_id === emp.id);
      empSummary.forEach(summary => {
        formattedData.leadSummary[emp.name][summary.month] = {
          pre: summary.fre || 0,
          off: summary.off || 0,
          rep: summary.rep || 0,
          app: summary.fam || 0
        };
      });
    });
    
    // Process monthly leads - already month-wise
    employees.forEach(emp => {
      const empMonthly = monthlyLeads.filter(m => m.employee_id === emp.id);
      formattedData.monthlyLeads[emp.name] = Array(12).fill(0);
      empMonthly.forEach(month => formattedData.monthlyLeads[emp.name][month.month] = month.value);
    });
    
    // Process batch data
    employees.forEach(emp => {
        formattedData.batchData.batchLeads[emp.name] = {};
        batches.forEach(batch => {
            const batchLead = batchLeads.find(bl => bl.employee_id === emp.id && bl.batch_id === batch.id);
            formattedData.batchData.batchLeads[emp.name][batch.id] = batchLead ? batchLead.value : 0;
        });
    });
    batches.forEach(b => formattedData.batchData.thc[b.id] = b.thc || 0);
    
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
    
    // Process webinar leads - UPDATED to structure by year
    formattedData.webinarLeads = {};
    if (webinarLeads && webinarLeads.length > 0) {
      webinarLeads.forEach(item => {
        const year = item.year; // Assumes 'year' column exists in DB
        if (!formattedData.webinarLeads[year]) {
          formattedData.webinarLeads[year] = {};
        }
        formattedData.webinarLeads[year][item.month] = item.lead_count;
      });
    }

    console.log(">>> [DEBUG] Data formatted. Sending response.");
    res.json(formattedData);
  } catch (error) {
    console.error('!!! [DEBUG] ERROR IN /api/sales !!!', error);
    res.status(500).json({ error: 'Failed to fetch sales data', details: error.message });
  }
});

// Save ALL sales data, including webinar leads and employee batches
app.post('/api/sales', async (req, res) => {
  try {
    const { employees, dailyBookings, leadSummary, monthlyLeads, batchData, monthlyBatchAdmin, customHeaders, webinarLeads, employeeBatches } = req.body;
    
    console.log(">>> [SAVE-DEBUG] Received request to save data.");

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
        if (data.length === 0) return;
        const { error } = await supabase.from(table).upsert(data, { onConflict: conflictColumns }); 
        if (error) throw error; 
    };

    // --- Save Daily Bookings ---
    const dailyBookingsToUpsert = [];
    for (const empName in dailyBookings) { 
      const empId = empIdMap[empName]; if (!empId) continue; 
      for (const month in dailyBookings[empName]) { 
        for (const day in dailyBookings[empName][month]) { 
          dailyBookingsToUpsert.push({ employee_id: empId, month: parseInt(month), day: parseInt(day), value: dailyBookings[empName][month][day] }); 
        } 
      } 
    } 
    await upsertData('daily_bookings', dailyBookingsToUpsert, 'employee_id, month, day');
    
    // --- Save Lead Summary (Month-wise) ---
    const leadSummaryToUpsert = []; 
    for (const empName in leadSummary) { 
      const empId = empIdMap[empName]; if (!empId) continue;
      const monthlySummary = leadSummary[empName];
      if (typeof monthlySummary === 'object' && monthlySummary !== null) {
        for (const monthKey in monthlySummary) {
          const month = parseInt(monthKey, 10);
          if (isNaN(month)) continue;
          const summary = monthlySummary[monthKey];
          leadSummaryToUpsert.push({ employee_id: empId, month: month, fre: summary.pre || 0, off: summary.off || 0, rep: summary.rep || 0, fam: summary.app || 0 });
        }
      }
    } 
    await upsertData('lead_summary', leadSummaryToUpsert, 'employee_id, month');

    // --- Save Monthly Leads ---
    const monthlyLeadsToUpsert = []; 
    for (const empName in monthlyLeads) { 
      const empId = empIdMap[empName]; if (!empId) continue; 
      for (let month = 0; month < 12; month++) { 
        monthlyLeadsToUpsert.push({ employee_id: empId, month: month, value: monthlyLeads[empName][month] || 0 }); 
      } 
    } 
    await upsertData('monthly_leads', monthlyLeadsToUpsert, 'employee_id, month');

    // --- Save Batch Data ---
    if (batchData) {
        const batchesToUpsert = batchData.batches.map(batch => ({ id: batch.id, label: batch.label, thc: batchData.thc[batch.id] || 0 })); 
        await upsertData('batches', batchesToUpsert, 'id'); 
        
        const batchLeadsToUpsert = []; 
        for (const empName in batchData.batchLeads) { 
          const empId = empIdMap[empName]; if (!empId) continue; 
          for (const batchId in batchData.batchLeads[empName]) { 
            batchLeadsToUpsert.push({ employee_id: empId, batch_id: batchId, value: batchData.batchLeads[empName][batchId] || 0 });
          } 
        } 
        await upsertData('batch_leads', batchLeadsToUpsert, 'employee_id, batch_id');
    }

    // --- Save Custom Headers ---
    if (customHeaders) {
      const { error: deleteHeadersError } = await supabase.from('custom_headers').delete().neq('id', 0);
      if (deleteHeadersError) throw deleteHeadersError;
      const headersToInsert = [];
      for (const tableName in customHeaders) { 
        headersToInsert.push({ table_name: tableName, headers: customHeaders[tableName] }); 
      }
      if (headersToInsert.length > 0) {
        const { error: insertHeadersError } = await supabase.from('custom_headers').insert(headersToInsert);
        if (insertHeadersError) throw insertHeadersError;
      }
    }

    // --- Save Monthly Batch Admin ---
    if (monthlyBatchAdmin && Object.keys(monthlyBatchAdmin).length > 0) {
      const employeeIds = Object.values(empIdMap);
      await supabase.from('monthly_batch_admin_leads').delete().in('employee_id', employeeIds);
      const adminDataToInsert = [];
      for (const empName in monthlyBatchAdmin) {
        const empId = empIdMap[empName]; if (!empId) continue;
        const leads = monthlyBatchAdmin[empName];
        adminDataToInsert.push({
          employee_id: empId, lead_10_jul: leads[0] || 0, lead_29_jul: leads[1] || 0, lead_jul: leads[2] || 0,
          lead_19_aug: leads[3] || 0, lead_aug: leads[4] || 0, lead_16_sep: leads[5] || 0,
          lead_sep: leads[6] || 0, lead_13_oct: leads[7] || 0, lead_oct: leads[8] || 0,
          lead_nov: leads[9] || 0, lead_dec: leads[10] || 0, lead_jan: leads[11] || 0,
          lead_10_nov: leads[12] || 0, lead_20_nov: leads[13] || 0, lead_14_dec: leads[14] || 0
        });
      }
      if (adminDataToInsert.length > 0) {
        const { error: insertError } = await supabase.from('monthly_batch_admin_leads').insert(adminDataToInsert);
        if (insertError) throw insertError;
      }
    }

    // --- Save Webinar Leads --- UPDATED for year-based structure
    if (webinarLeads) {
      const webinarLeadsToUpsert = [];
      for (const year in webinarLeads) {
        for (const month in webinarLeads[year]) {
          webinarLeadsToUpsert.push({ year: year, month: month, lead_count: webinarLeads[year][month] });
        }
      }
      
      // Delete existing webinar leads for all years being updated
      const yearsToUpdate = Object.keys(webinarLeads);
      for (const year of yearsToUpdate) {
        const { error: deleteError } = await supabase.from('webinar_leads').delete().eq('year', year);
        if (deleteError) throw deleteError;
      }
      
      if (webinarLeadsToUpsert.length > 0) {
        const { error: webinarError } = await supabase.from('webinar_leads').insert(webinarLeadsToUpsert);
        if (webinarError) throw webinarError;
      }
    }
    
    // --- Save Employee Batches --- NEW
    if (employeeBatches) {
        await supabase.from('employee_batches').delete().neq('id', 0); // Clear existing
        const batchAssignments = [];
        for (const empName in employeeBatches) {
            const empId = empIdMap[empName]; if (!empId || !employeeBatches[empName]) continue;
            batchAssignments.push({ employee_id: empId, batch_id: employeeBatches[empName] });
        }
        if (batchAssignments.length > 0) {
            const { error: insertError } = await supabase.from('employee_batches').insert(batchAssignments);
            if (insertError) throw insertError;
        }
    }

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
    if (error) { 
      if (error.code === '23505') return res.status(409).json({ error: 'Employee with this name already exists' }); 
      throw error; 
    }
    res.json({ success: true, employee: data });
  } catch (error) { 
    console.error('Error adding employee:', error); 
    res.status(500).json({ error: 'Failed to add employee', details: error.message }); 
  }
});

// Start Server
app.listen(port, () => { 
  console.log(`Server is running on http://localhost:${port}`); 
});
