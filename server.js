// server.js

// --- Dependencies ---
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');

// --- App Initialization ---
const app = express();
const port = process.env.PORT || 3000;

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(cookieParser());


// Initialize Supabase client
// WARNING: Move these to environment variables for production!
const supabaseUrl = 'https://ihyogsvmprdwubfqhzls.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImloeW9nc3ZtcHJkd3ViZnFoemxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxODk3NjMsImV4cCI6MjA4NTc2NTc2M30.uudrEHr5d5ntqfB3p8aRusRwE3cI5bh65sxt7BF2yQU';
const supabase = createClient(supabaseUrl, supabaseKey);

// --- Authentication Middleware ---
const authenticateToken = (req, res, next) => {
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// --- Authentication Routes ---

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    // Fetch admin user from database
    const { data: adminUser, error } = await supabase
      .from('admin_users')
      .select('*')
      .eq('username', username)
      .single();
    
    if (error || !adminUser) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    // Compare password with stored hash
    const isPasswordValid = await bcrypt.compare(password, adminUser.password_hash);
    
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    // Create JWT token
    const token = jwt.sign(
      { id: adminUser.id, username: adminUser.username, role: adminUser.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // Set HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Only send over HTTPS in production
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'strict'
    });
    
    // Return user info (excluding password hash)
    res.json({
      success: true,
      user: {
        id: adminUser.id,
        username: adminUser.username,
        role: adminUser.role,
        name: adminUser.name
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Logout endpoint
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logged out successfully' });
});

// Check authentication status
app.get('/api/auth/status', authenticateToken, (req, res) => {
  res.json({
    authenticated: true,
    user: {
      id: req.user.id,
      username: req.user.username,
      role: req.user.role
    }
  });
});

// Create admin user (for initial setup)
app.post('/api/auth/setup', async (req, res) => {
  try {
    // Check if any admin users exist
    const { data: existingAdmins, error: countError } = await supabase
      .from('admin_users')
      .select('id')
      .limit(1);
    
    if (countError) throw countError;
    
    if (existingAdmins && existingAdmins.length > 0) {
      return res.status(400).json({ error: 'Admin users already exist' });
    }
    
    const { username, password, name = 'Administrator' } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    // Create admin user
    const { data: adminUser, error: insertError } = await supabase
      .from('admin_users')
      .insert({
        username,
        password_hash: passwordHash,
        name,
        role: 'admin',
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (insertError) throw insertError;
    
    res.status(201).json({
      success: true,
      message: 'Admin user created successfully',
      user: {
        id: adminUser.id,
        username: adminUser.username,
        name: adminUser.name,
        role: adminUser.role
      }
    });
  } catch (error) {
    console.error('Setup error:', error);
    res.status(500).json({ error: 'Failed to create admin user' });
  }
});

// --- API Routes ---

// Get ALL sales data, including webinar leads and custom headers
app.get('/api/sales', authenticateToken, async (req, res) => {
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
      { data: employeeBatches, error: empBatchesError }, // Fetch employee batches
      { data: batchMonthMapping, error: batchMappingError } // NEW: Fetch batch-month mappings
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
      supabase.from('employee_batches').select('*'), // Existing table
      supabase.from('batch_month_mapping').select('*').order('batch_index') // NEW: Fetch batch-month mappings
    ]);

    // Check for all errors
    if (empError) throw empError; if (dailyError) throw dailyError;
    if (summaryError) throw summaryError; if (monthlyError) throw monthlyError;
    if (batchError) throw batchError; if (batchesError) throw batchesError;
    if (batchAdminError) throw batchAdminError;
    if (headersError) throw headersError;
    if (webinarError) throw webinarError;
    if (empBatchesError) throw empBatchesError;
    if (batchMappingError) throw batchMappingError;
    
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
      employeeBatches: {}, // Add employee batches to the response
      batchToMonthMapping: [] // NEW: Add batch-to-month mappings
    };

    // Process batch-to-month mappings
    if (batchMonthMapping && batchMonthMapping.length > 0) {
      formattedData.batchToMonthMapping = batchMonthMapping.map(mapping => ({
        batchIndex: mapping.batch_index,
        batchName: mapping.batch_name,
        monthIndex: mapping.month_index,
        monthName: mapping.month_name
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
app.post('/api/sales', authenticateToken, async (req, res) => {
  try {
    const { employees, dailyBookings, leadSummary, monthlyLeads, batchData, monthlyBatchAdmin, customHeaders, webinarLeads, employeeBatches, batchToMonthMapping } = req.body;
    
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
    
    // --- Save Employee Batches --- EXISTING
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
    
    // --- Save Batch-Month Mappings --- NEW
    if (batchToMonthMapping) {
      // Clear existing mappings
      const { error: deleteError } = await supabase.from('batch_month_mapping').delete().neq('id', 0);
      if (deleteError) throw deleteError;
      
      // Insert new mappings
      const mappingsToInsert = batchToMonthMapping.map(mapping => ({
        batch_index: mapping.batchIndex,
        batch_name: mapping.batchName,
        month_index: mapping.monthIndex,
        month_name: mapping.monthName
      }));
      
      if (mappingsToInsert.length > 0) {
        const { error: insertError } = await supabase.from('batch_month_mapping').insert(mappingsToInsert);
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
app.post('/api/employee', authenticateToken, async (req, res) => {
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
