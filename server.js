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

// Helper function to ensure database schema is up to date
async function ensureDatabaseSchema() {
  try {
    console.log("Checking database schema...");
    
    // Check if year column exists in webinar_leads table
    const { data: columns, error: columnsError } = await supabase
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_name', 'webinar_leads')
      .eq('column_name', 'year');
    
    if (columnsError) {
      console.error("Error checking columns:", columnsError);
      return false;
    }
    
    // If year column doesn't exist, add it
    if (!columns || columns.length === 0) {
      console.log("Year column doesn't exist, adding it...");
      
      // Try to add the column using raw SQL
      const { error: alterError } = await supabase.rpc('execute_sql', {
        sql: 'ALTER TABLE webinar_leads ADD COLUMN IF NOT EXISTS year INTEGER NOT NULL DEFAULT 2025'
      });
      
      if (alterError) {
        console.error("Error adding year column:", alterError);
        
        // Try alternative approach if RPC doesn't work
        try {
          // This won't work in Supabase without proper permissions, but let's try
          const { error: directError } = await supabase
            .from('webinar_leads')
            .update({ year: 2025 })
            .is('year', null);
            
          if (directError && directError.code !== 'PGRST116') {
            console.error("Error with direct update:", directError);
            return false;
          }
        } catch (e) {
          console.error("Alternative approach failed:", e);
          return false;
        }
      } else {
        console.log("Year column added successfully");
      }
    } else {
      console.log("Year column already exists");
    }
    
    return true;
  } catch (error) {
    console.error("Error ensuring database schema:", error);
    return false;
  }
}

// Initialize database schema on server start
ensureDatabaseSchema().then(success => {
  if (!success) {
    console.warn("Warning: Could not ensure database schema is up to date. Some features may not work correctly.");
  }
}).catch(error => {
  console.error("Error initializing database schema:", error);
});

// --- API Routes ---

// Get ALL sales data, including webinar leads, custom headers, and employee batches
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
      { data: employeeBatches, error: empBatchesError }
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
      supabase.from('employee_batches').select('*')
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
      leadSummary: {}, // Will be month-wise
      monthlyLeads: {}, // Will be month-wise
      batchData: { employees: employees.map(e => e.name), batches: batches, batchLeads: {}, thc: {} },
      monthlyBatchAdmin: {},
      customHeaders: { // Provide default headers
        daily: [], summary: ["Team Member", "Fresher", "Offline", "Repeater", "Family", "TOTAL"], monthly: ["Team Member"], batch: ["Team Member"], batchTable: ["Team Member"]
      },
      webinarLeads: {}, // Now organized by year
      employeeBatches: {} // New field to track which batch each employee belongs to
    };

    // Process custom headers
    if (customHeaders && customHeaders.length > 0) {
      customHeaders.forEach(header => {
        if (header.table_name && header.headers) {
          formattedData.customHeaders[header.table_name] = header.headers;
        }
      });
    }

    // Process employee batches
    employees.forEach(emp => {
      const batchAssignment = employeeBatches.find(b => b.employee_id === emp.id);
      formattedData.employeeBatches[emp.name] = batchAssignment ? batchAssignment.batch_id : null;
    });

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
      // Initialize all months with default values
      for (let month = 0; month < 12; month++) {
        formattedData.leadSummary[emp.name][month] = { pre: 0, off: 0, rep: 0, app: 0 };
      }
      
      // Fill with actual data from database
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
    
    // Process webinar leads - now organized by year
    if (webinarLeads && webinarLeads.length > 0) {
      webinarLeads.forEach(item => {
        // Check if the record has a year property (new format)
        if (item.year !== undefined) {
          // New format with year
          if (!formattedData.webinarLeads[item.year]) {
            formattedData.webinarLeads[item.year] = {};
          }
          formattedData.webinarLeads[item.year][item.month] = item.lead_count;
        } else {
          // Old format without year - assume 2025 as default year
          if (!formattedData.webinarLeads["2025"]) {
            formattedData.webinarLeads["2025"] = {};
          }
          formattedData.webinarLeads["2025"][item.month] = item.lead_count;
        }
      });
    }

    console.log(">>> [DEBUG] Data formatted. Sending response.");
    res.json(formattedData);
  } catch (error) {
    console.error('!!! [DEBUG] ERROR IN /api/sales !!!', error);
    res.status(500).json({ error: 'Failed to fetch sales data', details: error.message });
  }
});

// Save ALL sales data, including webinar leads and employee batches (WITH DETAILED LOGGING)
app.post('/api/sales', async (req, res) => {
  try {
    const { employees, dailyBookings, leadSummary, monthlyLeads, batchData, monthlyBatchAdmin, customHeaders, webinarLeads, employeeBatches } = req.body;
    
    console.log(">>> [SAVE-DEBUG] Received request to save data.");
    console.log(">>> [SAVE-DEBUG] Employees:", employees);
    console.log(">>> [SAVE-DEBUG] Webinar Leads Data Structure:", JSON.stringify(webinarLeads, null, 2));

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
    console.log(">>> [SAVE-DEBUG] Employee ID Map:", empIdMap);
    
    const upsertData = async (table, data, conflictColumns) => { 
        console.log(`>>> [SAVE-DEBUG] Preparing to upsert ${data.length} records into table '${table}'...`);
        const { error } = await supabase.from(table).upsert(data, { onConflict: conflictColumns }); 
        if (error) {
            console.error(`!!! [SAVE-DEBUG] Error upserting into ${table}:`, error);
            throw error; 
        }
        console.log(`>>> [SAVE-DEBUG] Successfully upserted into ${table}.`);
    };

    // --- Save Daily Bookings ---
    const dailyBookingsToUpsert = [];
    for (const empName in dailyBookings) { 
      const empId = empIdMap[empName]; 
      if (!empId) continue; 
      for (const month in dailyBookings[empName]) { 
        for (const day in dailyBookings[empName][month]) { 
          dailyBookingsToUpsert.push({ 
            employee_id: empId, 
            month: parseInt(month), 
            day: parseInt(day), 
            value: dailyBookings[empName][month][day] 
          }); 
        } 
      } 
    } 
    if (dailyBookingsToUpsert.length > 0) await upsertData('daily_bookings', dailyBookingsToUpsert, 'employee_id, month, day');
    
    // --- Save Lead Summary (Month-wise) ---
    const leadSummaryToUpsert = []; 
    for (const empName in leadSummary) { 
      const empId = empIdMap[empName]; 
      if (!empId) continue;
      
      // We now expect the new month-wise format
      const monthlySummary = leadSummary[empName];
      if (typeof monthlySummary === 'object' && monthlySummary !== null) {
        for (const monthKey in monthlySummary) {
          const month = parseInt(monthKey, 10);
          if (isNaN(month)) continue; // Skip invalid keys

          const summary = monthlySummary[monthKey];
          leadSummaryToUpsert.push({ 
            employee_id: empId, 
            month: month,
            fre: summary.pre || 0, 
            off: summary.off || 0, 
            rep: summary.rep || 0, 
            fam: summary.app || 0 
          });
        }
      }
    } 
    if (leadSummaryToUpsert.length > 0) await upsertData('lead_summary', leadSummaryToUpsert, 'employee_id, month');

    // --- Save Monthly Leads ---
    const monthlyLeadsToUpsert = []; 
    for (const empName in monthlyLeads) { 
      const empId = empIdMap[empName]; 
      if (!empId) continue; 
      for (let month = 0; month < 12; month++) { 
        monthlyLeadsToUpsert.push({ 
          employee_id: empId, 
          month: month, 
          value: monthlyLeads[empName][month] || 0 
        }); 
      } 
    } 
    if (monthlyLeadsToUpsert.length > 0) await upsertData('monthly_leads', monthlyLeadsToUpsert, 'employee_id, month');

    // --- Save Batch Data ---
    if (batchData) {
        const batchesToUpsert = batchData.batches.map(batch => ({ 
          id: batch.id, 
          label: batch.label, 
          thc: batchData.thc[batch.id] || 0 
        })); 
        if (batchesToUpsert.length > 0) await upsertData('batches', batchesToUpsert, 'id'); 
        
        const batchLeadsToUpsert = []; 
        for (const empName in batchData.batchLeads) { 
          const empId = empIdMap[empName]; 
          if (!empId) continue; 
          for (const batchId in batchData.batchLeads[empName]) { 
            batchLeadsToUpsert.push({ 
              employee_id: empId, 
              batch_id: batchId, 
              value: batchData.batchLeads[emp.name][batchId] || 0
            }); 
          } 
        } 
        if (batchLeadsToUpsert.length > 0) await upsertData('batch_leads', batchLeadsToUpsert, 'employee_id, batch_id');
    }

    // --- Save Custom Headers ---
    if (customHeaders) {
      const { error: deleteHeadersError } = await supabase.from('custom_headers').delete().neq('id', 0);
      if (deleteHeadersError) throw deleteHeadersError;
      const headersToInsert = [];
      for (const tableName in customHeaders) { 
        headersToInsert.push({ 
          table_name: tableName, 
          headers: customHeaders[tableName] 
        }); 
      }
      if (headersToInsert.length > 0) {
        const { error: insertHeadersError } = await supabase.from('custom_headers').insert(headersToInsert);
        if (insertHeadersError) throw insertHeadersError;
      }
    }

    // --- Save Monthly Batch Admin ---
    if (monthlyBatchAdmin && Object.keys(monthlyBatchAdmin).length > 0) {
      const employeeIds = Object.values(empIdMap);
      const { error: deleteError } = await supabase.from('monthly_batch_admin_leads').delete().in('employee_id', employeeIds);
      if (deleteError) throw deleteError;
      const adminDataToInsert = [];
      for (const empName in monthlyBatchAdmin) {
        const empId = empIdMap[empName]; 
        if (!empId) continue;
        const leads = monthlyBatchAdmin[empName];
        adminDataToInsert.push({
          employee_id: empId, 
          lead_10_jul: leads[0] || 0, 
          lead_29_jul: leads[1] || 0, 
          lead_jul: leads[2] || 0,
          lead_19_aug: leads[3] || 0, 
          lead_aug: leads[4] || 0, 
          lead_16_sep: leads[5] || 0,
          lead_sep: leads[6] || 0, 
          lead_13_oct: leads[7] || 0, 
          lead_oct: leads[8] || 0,
          lead_nov: leads[9] || 0, 
          lead_dec: leads[10] || 0, 
          lead_jan: leads[11] || 0,
          lead_10_nov: leads[12] || 0, 
          lead_20_nov: leads[13] || 0, 
          lead_14_dec: leads[14] || 0
        });
      }
      if (adminDataToInsert.length > 0) {
        const { error: insertError } = await supabase.from('monthly_batch_admin_leads').insert(adminDataToInsert);
        if (insertError) throw insertError;
      }
    }

    // --- Save Employee Batches ---
    if (employeeBatches) {
      const employeeIds = Object.values(empIdMap);
      const { error: deleteError } = await supabase.from('employee_batches').delete().in('employee_id', employeeIds);
      if (deleteError) throw deleteError;
      
      const batchAssignmentsToInsert = [];
      for (const empName in employeeBatches) {
        const empId = empIdMap[empName]; 
        if (!empId) continue;
        const batchId = employeeBatches[empName];
        if (batchId) { // Only insert if a batch is assigned
          batchAssignmentsToInsert.push({
            employee_id: empId, 
            batch_id: batchId
          });
        }
      }
      if (batchAssignmentsToInsert.length > 0) {
        const { error: insertError } = await supabase.from('employee_batches').insert(batchAssignmentsToInsert);
        if (insertError) throw insertError;
      }
    }

    // --- Save Webinar Leads ---
    if (webinarLeads) {
      // First, check if year column exists
      const { data: columns, error: columnsError } = await supabase
        .from('information_schema.columns')
        .select('column_name')
        .eq('table_name', 'webinar_leads')
        .eq('column_name', 'year');
      
      if (columnsError) {
        console.error("Error checking columns:", columnsError);
      } else if (!columns || columns.length === 0) {
        console.log("Year column doesn't exist, using fallback approach");
        
        // Fallback: Try to save without year column
        const webinarLeadsToInsert = [];
        
        // Check if webinarLeads is already organized by year (new format)
        if (typeof webinarLeads === 'object' && !Array.isArray(webinarLeads)) {
          // New format with years - just use the first year for now
          for (const year in webinarLeads) {
            const yearData = webinarLeads[year];
            if (typeof yearData === 'object') {
              for (const month in yearData) {
                webinarLeadsToInsert.push({
                  month: month,
                  lead_count: yearData[month]
                });
              }
              break; // Only process the first year for now
            }
          }
        } else {
          // Old format without years
          for (const month in webinarLeads) {
            webinarLeadsToInsert.push({
              month: month,
              lead_count: webinarLeads[month]
            });
          }
        }
        
        if (webinarLeadsToInsert.length > 0) {
          console.log(">>> [SAVE-DEBUG] Inserting webinar leads (fallback):", webinarLeadsToInsert);
          
          // Delete existing records
          const { error: deleteError } = await supabase.from('webinar_leads').delete().neq('id', 0);
          if (deleteError) throw deleteError;
          
          // Insert new records
          const { error: webinarError } = await supabase.from('webinar_leads').insert(webinarLeadsToInsert);
          if (webinarError) {
            console.error("!!! [SAVE-DEBUG] Error inserting webinar leads (fallback):", webinarError);
            throw webinarError;
          }
        }
      } else {
        // Year column exists, use the full functionality
        const webinarLeadsToInsert = [];
        
        // Check if webinarLeads is already organized by year (new format)
        if (typeof webinarLeads === 'object' && !Array.isArray(webinarLeads)) {
          // New format with years
          for (const year in webinarLeads) {
            const yearData = webinarLeads[year];
            if (typeof yearData === 'object') {
              for (const month in yearData) {
                webinarLeadsToInsert.push({
                  year: parseInt(year),
                  month: month,
                  lead_count: yearData[month]
                });
              }
            }
          }
        } else {
          // Old format without years - assume 2025
          for (const month in webinarLeads) {
            webinarLeadsToInsert.push({
              year: 2025,
              month: month,
              lead_count: webinarLeads[month]
            });
          }
        }
        
        if (webinarLeadsToInsert.length > 0) {
          console.log(">>> [SAVE-DEBUG] Inserting webinar leads (full):", webinarLeadsToInsert);
          
          // Delete existing records
          const { error: deleteError } = await supabase.from('webinar_leads').delete().neq('id', 0);
          if (deleteError) throw deleteError;
          
          // Insert new records
          const { error: webinarError } = await supabase.from('webinar_leads').insert(webinarLeadsToInsert);
          if (webinarError) {
            console.error("!!! [SAVE-DEBUG] Error inserting webinar leads (full):", webinarError);
            throw webinarError;
          }
        }
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
    const { name, batchId } = req.body;
    if (!name) return res.status(400).json({ error: 'Employee name is required' });
    
    // Insert the employee
    const { data: newEmployee, error: empError } = await supabase.from('employees').insert({ name }).select().single();
    if (empError) { 
      if (empError.code === '23505') return res.status(409).json({ error: 'Employee with this name already exists' }); 
      throw empError; 
    }
    
    // If a batch ID was provided, assign the employee to that batch
    if (batchId) {
      const { error: batchError } = await supabase.from('employee_batches').insert({
        employee_id: newEmployee.id, // This is now a UUID
        batch_id: batchId
      });
      if (batchError) throw batchError;
    }
    
    res.json({ success: true, employee: newEmployee });
  } catch (error) { 
    console.error('Error adding employee:', error); 
    res.status(500).json({ error: 'Failed to add employee', details: error.message }); 
  }
});

// Get lead summary for a specific month and batch
app.get('/api/lead-summary/:month', async (req, res) => {
  try {
    const month = parseInt(req.params.month);
    const batchId = req.query.batchId; // Optional batch filter
    if (isNaN(month) || month < 0 || month > 11) {
      return res.status(400).json({ error: 'Invalid month. Must be between 0 (January) and 11 (December).' });
    }

    // Get employees, optionally filtered by batch
    let employees;
    
    if (batchId) {
      // Get employees in the specified batch
      const { data: empBatches, error: batchError } = await supabase
        .from('employee_batches')
        .select('employee_id')
        .eq('batch_id', batchId);
      
      if (batchError) throw batchError;
      
      const employeeIds = empBatches.map(eb => eb.employee_id);
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .in('id', employeeIds);
      
      if (error) throw error;
      employees = data;
    } else {
      // Get all employees
      const { data, error } = await supabase.from('employees').select('*');
      if (error) throw error;
      employees = data;
    }

    const { data: leadSummary, error: summaryError } = await supabase
      .from('lead_summary')
      .select('*')
      .eq('month', month);
    if (summaryError) throw summaryError;

    const result = {};
    employees.forEach(emp => {
      const summary = leadSummary.find(s => s.employee_id === emp.id);
      result[emp.name] = summary ? {
        pre: summary.fre,
        off: summary.off,
        rep: summary.rep,
        app: summary.fam
      } : { pre: 0, off: 0, rep: 0, app: 0 };
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching lead summary:', error);
    res.status(500).json({ error: 'Failed to fetch lead summary', details: error.message });
  }
});

// Get monthly leads for a specific month and batch
app.get('/api/monthly-leads/:month', async (req, res) => {
  try {
    const month = parseInt(req.params.month);
    const batchId = req.query.batchId; // Optional batch filter
    if (isNaN(month) || month < 0 || month > 11) {
      return res.status(400).json({ error: 'Invalid month. Must be between 0 (January) and 11 (December).' });
    }

    // Get employees, optionally filtered by batch
    let employees;
    
    if (batchId) {
      // Get employees in the specified batch
      const { data: empBatches, error: batchError } = await supabase
        .from('employee_batches')
        .select('employee_id')
        .eq('batch_id', batchId);
      
      if (batchError) throw batchError;
      
      const employeeIds = empBatches.map(eb => eb.employee_id);
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .in('id', employeeIds);
      
      if (error) throw error;
      employees = data;
    } else {
      // Get all employees
      const { data, error } = await supabase.from('employees').select('*');
      if (error) throw error;
      employees = data;
    }

    const { data: monthlyLeads, error: monthlyError } = await supabase
      .from('monthly_leads')
      .select('*')
      .eq('month', month);
    if (monthlyError) throw monthlyError;

    const result = {};
    employees.forEach(emp => {
      const lead = monthlyLeads.find(m => m.employee_id === emp.id);
      result[emp.name] = lead ? lead.value : 0;
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching monthly leads:', error);
    res.status(500).json({ error: 'Failed to fetch monthly leads', details: error.message });
  }
});

// Get all batches
app.get('/api/batches', async (req, res) => {
  try {
    const { data, error } = await supabase.from('batches').select('*');
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching batches:', error);
    res.status(500).json({ error: 'Failed to fetch batches', details: error.message });
  }
});

// Update employee batch assignment
app.put('/api/employee/:id/batch', async (req, res) => {
  try {
    const employeeId = req.params.id; // This should be a UUID string
    const { batchId } = req.body;
    
    // Validate that employeeId is a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(employeeId)) {
      return res.status(400).json({ error: 'Invalid employee ID format' });
    }
    
    // Check if employee exists
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('id')
      .eq('id', employeeId)
      .single();
    
    if (empError || !employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    // Delete existing batch assignment
    const { error: deleteError } = await supabase
      .from('employee_batches')
      .delete()
      .eq('employee_id', employeeId);
    
    if (deleteError) throw deleteError;
    
    // Add new batch assignment if batchId is provided
    if (batchId) {
      const { error: insertError } = await supabase
        .from('employee_batches')
        .insert({
          employee_id: employeeId, // UUID
          batch_id: batchId
        });
      
      if (insertError) throw insertError;
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating employee batch:', error);
    res.status(500).json({ error: 'Failed to update employee batch', details: error.message });
  }
});

// Get employees by batch
app.get('/api/employees/by-batch/:batchId', async (req, res) => {
  try {
    const batchId = req.params.batchId;
    
    // Get employee IDs from the batch
    const { data: empBatches, error: batchError } = await supabase
      .from('employee_batches')
      .select('employee_id')
      .eq('batch_id', batchId);
    
    if (batchError) throw batchError;
    
    if (empBatches.length === 0) {
      return res.json([]); // No employees in this batch
    }
    
    const employeeIds = empBatches.map(eb => eb.employee_id);
    
    // Get employee details
    const { data: employees, error: empError } = await supabase
      .from('employees')
      .select('*')
      .in('id', employeeIds);
    
    if (empError) throw empError;
    
    res.json(employees);
  } catch (error) {
    console.error('Error fetching employees by batch:', error);
    res.status(500).json({ error: 'Failed to fetch employees by batch', details: error.message });
  }
});

// Get employee batch assignment
app.get('/api/employee/:name/batch', async (req, res) => {
  try {
    const employeeName = req.params.name;
    
    // Get employee by name
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('id')
      .eq('name', employeeName)
      .single();
    
    if (empError || !employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    // Get batch assignment
    const { data: batchAssignment, error: batchError } = await supabase
      .from('employee_batches')
      .select('batch_id')
      .eq('employee_id', employee.id)
      .single();
    
    if (batchError && batchError.code !== 'PGRST116') {
      throw batchError;
    }
    
    res.json({ 
      employeeId: employee.id,
      batchId: batchAssignment ? batchAssignment.batch_id : null 
    });
  } catch (error) {
    console.error('Error fetching employee batch:', error);
    res.status(500).json({ error: 'Failed to fetch employee batch', details: error.message });
  }
});

// Get webinar leads by year
app.get('/api/webinar-leads/:year', async (req, res) => {
  try {
    const year = parseInt(req.params.year);
    if (isNaN(year)) {
      return res.status(400).json({ error: 'Invalid year format' });
    }

    // Check if year column exists
    const { data: columns, error: columnsError } = await supabase
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_name', 'webinar_leads')
      .eq('column_name', 'year');
    
    if (columnsError) {
      console.error("Error checking columns:", columnsError);
      return res.status(500).json({ error: 'Failed to check database schema', details: columnsError.message });
    }
    
    let data;
    
    if (!columns || columns.length === 0) {
      // Year column doesn't exist, just return all webinar leads
      const { data: allLeads, error: leadsError } = await supabase
        .from('webinar_leads')
        .select('*');
      
      if (leadsError) throw leadsError;
      
      // Format the data as month: lead_count
      const result = {};
      allLeads.forEach(item => {
        result[item.month] = item.lead_count;
      });
      
      return res.json(result);
    } else {
      // Year column exists, filter by year
      const { data: yearLeads, error: leadsError } = await supabase
        .from('webinar_leads')
        .select('*')
        .eq('year', year);
      
      if (leadsError) throw leadsError;
      
      // Format the data as month: lead_count
      const result = {};
      yearLeads.forEach(item => {
        result[item.month] = item.lead_count;
      });
      
      return res.json(result);
    }
  } catch (error) {
    console.error('Error fetching webinar leads:', error);
    res.status(500).json({ error: 'Failed to fetch webinar leads', details: error.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start Server
app.listen(port, () => { 
  console.log(`Server is running on port ${port}`); 
});
