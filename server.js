// server.js
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Supabase client
const supabaseUrl = 'https://ihyogsvmprdwubfqhzls.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImloeW9nc3ZtcHJkd3ViZnFoemxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxODk3NjMsImV4cCI6MjA4NTc2NTc2M30.uudrEHr5d5ntqfB3p8aRusRwE3cI5bh65sxt7BF2yQU';
const supabase = createClient(supabaseUrl, supabaseKey);

// API Routes

// Get all sales data
app.get('/api/sales', async (req, res) => {
  try {
    const { data: employees, error: empError } = await supabase
      .from('employees')
      .select('*');
    
    if (empError) throw empError;
    
    const { data: dailyBookings, error: dailyError } = await supabase
      .from('daily_bookings')
      .select('*');
    
    if (dailyError) throw dailyError;
    
    const { data: leadSummary, error: summaryError } = await supabase
      .from('lead_summary')
      .select('*');
    
    if (summaryError) throw summaryError;
    
    const { data: monthlyLeads, error: monthlyError } = await supabase
      .from('monthly_leads')
      .select('*');
    
    if (monthlyError) throw monthlyError;
    
    const { data: batchLeads, error: batchError } = await supabase
      .from('batch_leads')
      .select('*');
    
    if (batchError) throw batchError;
    
    const { data: batches, error: batchesError } = await supabase
      .from('batches')
      .select('*');
    
    if (batchesError) throw batchesError;
    
    // NEW: Fetch monthly batch admin data
    const { data: monthlyBatchAdmin, error: monthlyBatchError } = await supabase
      .from('monthly_batch_admin')
      .select('*');
    
    if (monthlyBatchError) throw monthlyBatchError;
    
    // Format the data to match the frontend structure
    const formattedData = {
      employees: employees.map(e => e.name),
      dailyBookings: {},
      leadSummary: {},
      monthlyLeads: {},
      batchData: {
        employees: employees.map(e => e.name),
        batches: batches,
        batchLeads: {},
        thc: {}
      },
      monthlyBatchData: [] // NEW: Add monthly batch admin data
    };
    
    // Format daily bookings
    employees.forEach(emp => {
      formattedData.dailyBookings[emp.name] = {};
      const empDailyBookings = dailyBookings.filter(d => d.employee_id === emp.id);
      empDailyBookings.forEach(booking => {
        if (!formattedData.dailyBookings[emp.name][booking.month]) {
          formattedData.dailyBookings[emp.name][booking.month] = {};
        }
        formattedData.dailyBookings[emp.name][booking.month][booking.day] = booking.value;
      });
    });
    
    // Format lead summary
    employees.forEach(emp => {
      const empSummary = leadSummary.find(s => s.employee_id === emp.id);
      formattedData.leadSummary[emp.name] = empSummary ? {
        pre: empSummary.fre,
        off: empSummary.off,
        rep: empSummary.rep,
        app: empSummary.fam
      } : { pre: 0, off: 0, rep: 0, app: 0 };
    });
    
    // Format monthly leads
    employees.forEach(emp => {
      const empMonthly = monthlyLeads.filter(m => m.employee_id === emp.id);
      formattedData.monthlyLeads[emp.name] = Array(12).fill(0);
      empMonthly.forEach(month => {
        formattedData.monthlyLeads[emp.name][month.month] = month.value;
      });
    });
    
    // Format batch data
    employees.forEach(emp => {
      formattedData.batchData.batchLeads[emp.name] = {};
      batches.forEach(batch => {
        const batchLead = batchLeads.find(bl => 
          bl.employee_id === emp.id && bl.batch_id === batch.id
        );
        formattedData.batchData.batchLeads[emp.name][batch.id] = batchLead ? batchLead.value : 0;
      });
    });
    
    batches.forEach(batch => {
      formattedData.batchData.thc[batch.id] = batch.thc || 0;
    });
    
    // NEW: Format monthly batch admin data
    monthlyBatchAdmin.forEach(record => {
      const empName = employees.find(e => e.id === record.employee_id)?.name;
      if (empName) {
        const leads = [
          record.jul_10 || 0,
          record.jul_29 || 0,
          record.jul_lead || 0,
          record.aug_19 || 0,
          record.aug_lead || 0,
          record.sep_16 || 0,
          record.sep_lead || 0,
          record.oct_13 || 0,
          record.oct_lead || 0,
          record.nov_lead || 0,
          record.dec_lead || 0,
          record.jan_lead || 0
        ];
        
        formattedData.monthlyBatchData.push({
          name: empName,
          leads: leads
        });
      }
    });
    
    res.json(formattedData);
  } catch (error) {
    console.error('Error fetching sales data:', error);
    res.status(500).json({ error: 'Failed to fetch sales data' });
  }
});

// Save all sales data
app.post('/api/sales', async (req, res) => {
  try {
    const { employees, dailyBookings, leadSummary, monthlyLeads, batchData, monthlyBatchData } = req.body;
    
    // First, ensure all employees exist
    for (const empName of employees) {
      const { data: existingEmp, error: empError } = await supabase
        .from('employees')
        .select('id')
        .eq('name', empName)
        .single();
      
      if (!existingEmp) {
        await supabase
          .from('employees')
          .insert({ name: empName });
      }
    }
    
    // Get all employee IDs
    const { data: allEmployees, error: allEmpError } = await supabase
      .from('employees')
      .select('id, name');
    
    if (allEmpError) throw allEmpError;
    
    const empIdMap = {};
    allEmployees.forEach(emp => {
      empIdMap[emp.name] = emp.id;
    });
    
    // Save daily bookings
    for (const empName in dailyBookings) {
      const empId = empIdMap[empName];
      if (!empId) continue;
      
      for (const month in dailyBookings[empName]) {
        for (const day in dailyBookings[empName][month]) {
          const value = dailyBookings[empName][month][day];
          
          const { data: existing, error: checkError } = await supabase
            .from('daily_bookings')
            .select('id')
            .eq('employee_id', empId)
            .eq('month', month)
            .eq('day', day)
            .single();
          
          if (existing) {
            await supabase
              .from('daily_bookings')
              .update({ value })
              .eq('id', existing.id);
          } else {
            await supabase
              .from('daily_bookings')
              .insert({
                employee_id: empId,
                month,
                day,
                value
              });
          }
        }
      }
    }
    
    // Save lead summary
    for (const empName in leadSummary) {
      const empId = empIdMap[empName];
      if (!empId) continue;
      
      const summary = leadSummary[empName];
      
      const { data: existing, error: checkError } = await supabase
        .from('lead_summary')
        .select('id')
        .eq('employee_id', empId)
        .single();
      
      if (existing) {
        await supabase
          .from('lead_summary')
          .update({
            fre: summary.pre,
            off: summary.off,
            rep: summary.rep,
            fam: summary.app
          })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('lead_summary')
          .insert({
            employee_id: empId,
            fre: summary.pre,
            off: summary.off,
            rep: summary.rep,
            fam: summary.app
          });
      }
    }
    
    // Save monthly leads
    for (const empName in monthlyLeads) {
      const empId = empIdMap[empName];
      if (!empId) continue;
      
      for (let month = 0; month < 12; month++) {
        const value = monthlyLeads[empName][month];
        
        const { data: existing, error: checkError } = await supabase
          .from('monthly_leads')
          .select('id')
          .eq('employee_id', empId)
          .eq('month', month)
          .single();
        
        if (existing) {
          await supabase
            .from('monthly_leads')
            .update({ value })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('monthly_leads')
            .insert({
              employee_id: empId,
              month,
              value
            });
        }
      }
    }
    
    // Save batch data
    if (batchData) {
      // Save batches
      for (const batch of batchData.batches) {
        const { data: existing, error: checkError } = await supabase
          .from('batches')
          .select('id')
          .eq('id', batch.id)
          .single();
        
        if (existing) {
          await supabase
            .from('batches')
            .update({
              label: batch.label,
              thc: batchData.thc[batch.id] || 0
            })
            .eq('id', batch.id);
        } else {
          await supabase
            .from('batches')
            .insert({
              id: batch.id,
              label: batch.label,
              thc: batchData.thc[batch.id] || 0
            });
        }
      }
      
      // Save batch leads
      for (const empName in batchData.batchLeads) {
        const empId = empIdMap[empName];
        if (!empId) continue;
        
        for (const batchId in batchData.batchLeads[empName]) {
          const value = batchData.batchLeads[empName][batchId];
          
          const { data: existing, error: checkError } = await supabase
            .from('batch_leads')
            .select('id')
            .eq('employee_id', empId)
            .eq('batch_id', batchId)
            .single();
          
          if (existing) {
            await supabase
              .from('batch_leads')
              .update({ value })
              .eq('id', existing.id);
          } else {
            await supabase
              .from('batch_leads')
              .insert({
                employee_id: empId,
                batch_id: batchId,
                value
              });
          }
        }
      }
    }
    
    // NEW: Save monthly batch admin data
    if (monthlyBatchData) {
      // First, delete existing records for all employees to avoid duplicates
      for (const empName of employees) {
        const empId = empIdMap[empName];
        if (empId) {
          await supabase
            .from('monthly_batch_admin')
            .delete()
            .eq('employee_id', empId);
        }
      }
      
      // Insert new records
      for (const record of monthlyBatchData) {
        const empId = empIdMap[record.name];
        if (!empId) continue;
        
        await supabase
          .from('monthly_batch_admin')
          .insert({
            employee_id: empId,
            jul_10: record.leads[0] || 0,
            jul_29: record.leads[1] || 0,
            jul_lead: record.leads[2] || 0,
            aug_19: record.leads[3] || 0,
            aug_lead: record.leads[4] || 0,
            sep_16: record.leads[5] || 0,
            sep_lead: record.leads[6] || 0,
            oct_13: record.leads[7] || 0,
            oct_lead: record.leads[8] || 0,
            nov_lead: record.leads[9] || 0,
            dec_lead: record.leads[10] || 0,
            jan_lead: record.leads[11] || 0
          });
      }
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving sales data:', error);
    res.status(500).json({ error: 'Failed to save sales data' });
  }
});

// Add new employee
app.post('/api/employee', async (req, res) => {
  try {
    const { name } = req.body;
    
    const { data, error } = await supabase
      .from('employees')
      .insert({ name })
      .select();
    
    if (error) throw error;
    
    res.json({ success: true, employee: data[0] });
  } catch (error) {
    console.error('Error adding employee:', error);
    res.status(500).json({ error: 'Failed to add employee' });
  }
});

// NEW: Save monthly batch admin data separately
app.post('/api/monthly-batch', async (req, res) => {
  try {
    const { monthlyBatchData } = req.body;
    
    // Get all employee IDs
    const { data: allEmployees, error: allEmpError } = await supabase
      .from('employees')
      .select('id, name');
    
    if (allEmpError) throw allEmpError;
    
    const empIdMap = {};
    allEmployees.forEach(emp => {
      empIdMap[emp.name] = emp.id;
    });
    
    // Delete existing records for employees being updated
    for (const record of monthlyBatchData) {
      const empId = empIdMap[record.name];
      if (empId) {
        await supabase
          .from('monthly_batch_admin')
          .delete()
          .eq('employee_id', empId);
      }
    }
    
    // Insert new records
    for (const record of monthlyBatchData) {
      const empId = empIdMap[record.name];
      if (!empId) continue;
      
      await supabase
        .from('monthly_batch_admin')
        .insert({
          employee_id: empId,
          jul_10: record.leads[0] || 0,
          jul_29: record.leads[1] || 0,
          jul_lead: record.leads[2] || 0,
          aug_19: record.leads[3] || 0,
          aug_lead: record.leads[4] || 0,
          sep_16: record.leads[5] || 0,
          sep_lead: record.leads[6] || 0,
          oct_13: record.leads[7] || 0,
          oct_lead: record.leads[8] || 0,
          nov_lead: record.leads[9] || 0,
          dec_lead: record.leads[10] || 0,
          jan_lead: record.leads[11] || 0
        });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving monthly batch data:', error);
    res.status(500).json({ error: 'Failed to save monthly batch data' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
