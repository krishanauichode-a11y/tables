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
// NOTE: In production, use environment variables for the URL and Key
const supabaseUrl = 'https://ihyogsvmprdwubfqhzls.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImloeW9nc3ZtcHJkd3ViZnFoemxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxODk3NjMsImV4cCI6MjA4NTc2NTc2M30.uudrEHr5d5ntqfB3p8aRusRwE3cI5bh65sxt7BF2yQU';
const supabase = createClient(supabaseUrl, supabaseKey);

// --- API Routes ---

// Get ALL sales data, including webinar leads, performance, and custom headers
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
      { data: employeeBatches, error: empBatchesError },
      { data: batchMonthMapping, error: batchMappingError },
      { data: webinarData, error: webinarDataError },
      { data: webinarPerformanceData, error: webinarPerfError },
      { data: dailyWebinarPerformance, error: dailyWebinarPerfError } // NEW: Daily Webinar Performance
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
      supabase.from('daily_webinar_performance').select('*') // NEW: Daily Webinar Performance
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
    if (webinarDataError) throw webinarDataError;
    if (webinarPerfError) throw webinarPerfError;
    if (dailyWebinarPerfError) throw dailyWebinarPerfError; // NEW
    
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
      dailyWebinarPerformance: {} // NEW: Daily Webinar Performance
    };

    // Process batch-to-month mappings with year
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

    // Process daily bookings - Year-wise structure
    employees.forEach(emp => {
      formattedData.dailyBookings[emp.name] = {};
      formattedData.dailyBookingsByYear[emp.name] = {};
      
      const empDailyBookings = dailyBookings.filter(d => d.employee_id === emp.id);
      empDailyBookings.forEach(booking => {
        const year = booking.year || "2026";
        
        // Legacy structure
        if (!formattedData.dailyBookings[emp.name][booking.month]) {
          formattedData.dailyBookings[emp.name][booking.month] = {};
        }
        formattedData.dailyBookings[emp.name][booking.month][booking.day] = booking.value;
        
        // Year-wise structure
        if (!formattedData.dailyBookingsByYear[emp.name][year]) {
          formattedData.dailyBookingsByYear[emp.name][year] = {};
        }
        if (!formattedData.dailyBookingsByYear[emp.name][year][booking.month]) {
          formattedData.dailyBookingsByYear[emp.name][year][booking.month] = {};
        }
        formattedData.dailyBookingsByYear[emp.name][year][booking.month][booking.day] = booking.value;
      });
    });
    
    // Process lead summary - month-wise
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
    
    // Process monthly leads - Year-wise structure
    employees.forEach(emp => {
      const empMonthly = monthlyLeads.filter(m => m.employee_id === emp.id);
      formattedData.monthlyLeads[emp.name] = Array(12).fill(0);
      formattedData.monthlyLeadsByYear[emp.name] = {};
      
      empMonthly.forEach(month => {
        const year = month.year || "2026";
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
    
    // Process webinar leads
    formattedData.webinarLeads = {};
    if (webinarLeads && webinarLeads.length > 0) {
      webinarLeads.forEach(item => {
        const year = item.year || "2026";
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
        const year = item.year || "2026";
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
          const year = item.year || "2026";
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

    // Process Daily Webinar Performance Data (NEW)
    formattedData.dailyWebinarPerformance = {};
    employees.forEach(emp => {
      formattedData.dailyWebinarPerformance[emp.name] = {};
      const empDailyWebinar = dailyWebinarPerformance.filter(d => d.employee_id === emp.id);
      empDailyWebinar.forEach(entry => {
        const year = entry.year || "2026";
        if (!formattedData.dailyWebinarPerformance[emp.name][year]) {
          formattedData.dailyWebinarPerformance[emp.name][year] = {};
        }
        if (!formattedData.dailyWebinarPerformance[emp.name][year][entry.month]) {
          formattedData.dailyWebinarPerformance[emp.name][year][entry.month] = {};
        }
        formattedData.dailyWebinarPerformance[emp.name][year][entry.month][entry.day] = entry.value;
      });
    });

    console.log(">>> [DEBUG] Data formatted. Sending response.");
    res.json(formattedData);
  } catch (error) {
    console.error('!!! [DEBUG] ERROR IN /api/sales !!!', error);
    res.status(500).json({ error: 'Failed to fetch sales data', details: error.message });
  }
});

// Save ALL sales data, including webinar leads, performance, and employee batches
app.post('/api/sales', async (req, res) => {
  try {
    const { 
      employees, 
      employeeOrder, 
      dailyBookings, 
      dailyBookingsByYear, 
      leadSummary, 
      monthlyLeads, 
      monthlyLeadsByYear, 
      batchData, 
      monthlyBatchAdmin, 
      customHeaders, 
      webinarLeads, 
      employeeBatches, 
      batchToMonthMapping, 
      webinarData,
      webinarPerformanceData,
      dailyWebinarPerformance // NEW: Daily Webinar Performance
    } = req.body;
    
    console.log(">>> [SAVE-DEBUG] Received request to save data.");

    const empIdMap = {};
    for (const empName of employees) {
      const { data: existingEmp, error: empError } = await supabase.from('employees').select('id').eq('name', empName).single();
      if (empError && empError.code !== 'PGRST116') throw empError;
      if (existingEmp) { 
        empIdMap[empName] = existingEmp.id; 
      } else {
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
    
    if (dailyBookings) {
      for (const empName in dailyBookings) { 
        const empId = empIdMap[empName]; 
        if (!empId) continue; 
        for (const month in dailyBookings[empName]) { 
          for (const day in dailyBookings[empName][month]) { 
            dailyBookingsToUpsert.push({ 
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
              dailyBookingsToUpsert.push({
                employee_id: empId,
                month: parseInt(month),
                day: parseInt(day),
                value: dailyBookingsByYear[empName][year][month][day],
                year: year
              });
            }
          }
        }
      }
    }
    
    const employeeIds = Object.values(empIdMap);
    await supabase.from('daily_bookings').delete().in('employee_id', employeeIds);
    
    if (dailyBookingsToUpsert.length > 0) {
      await upsertData('daily_bookings', dailyBookingsToUpsert, 'employee_id, month, day, year');
    }
    
    // --- Save Lead Summary ---
    const leadSummaryToUpsert = []; 
    for (const empName in leadSummary) { 
      const empId = empIdMap[empName]; 
      if (!empId) continue;
      const monthlySummary = leadSummary[empName];
      if (typeof monthlySummary === 'object' && monthlySummary !== null) {
        for (const monthKey in monthlySummary) {
          const month = parseInt(monthKey, 10);
          if (isNaN(month)) continue;
          const summary = monthlySummary[monthKey];
          leadSummaryToUpsert.push({ 
            employee_id: empId, 
            month: month, 
            fre: summary.pre || 0, 
            off: summary.off || 0, 
            rep: summary.rep || 0, 
            fam: summary.app || 0,
            bas: summary.bas || 0,
            adv: summary.adv || 0,
            att: summary.att || 0
          });
        }
      }
    } 
    await upsertData('lead_summary', leadSummaryToUpsert, 'employee_id, month');

    // --- Save Monthly Leads ---
    const monthlyLeadsToUpsert = [];
    
    if (monthlyLeads) {
      for (const empName in monthlyLeads) { 
        const empId = empIdMap[empName]; 
        if (!empId) continue; 
        for (let month = 0; month < 12; month++) { 
          monthlyLeadsToUpsert.push({ 
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
            monthlyLeadsToUpsert.push({
              employee_id: empId,
              month: month,
              value: monthlyLeadsByYear[empName][year][month] || 0,
              year: year
            });
          }
        }
      }
    }
    
    await supabase.from('monthly_leads').delete().in('employee_id', employeeIds);
    
    if (monthlyLeadsToUpsert.length > 0) {
      await upsertData('monthly_leads', monthlyLeadsToUpsert, 'employee_id, month, year');
    }

    // --- Save Batch Data ---
    if (batchData) {
      const batchesToUpsert = batchData.batches.map(batch => ({ 
        id: batch.id, 
        label: batch.label, 
        thc: batchData.thc[batch.id] || 0 
      })); 
      await upsertData('batches', batchesToUpsert, 'id'); 
      
      const batchLeadsToUpsert = []; 
      for (const empName in batchData.batchLeads) { 
        const empId = empIdMap[empName]; 
        if (!empId) continue; 
        for (const batchId in batchData.batchLeads[empName]) { 
          batchLeadsToUpsert.push({ 
            employee_id: empId, 
            batch_id: batchId, 
            value: batchData.batchLeads[empName][batchId] || 0 
          });
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

    // --- Save Employee Order ---
    if (employeeOrder && Array.isArray(employeeOrder)) {
      const { error: orderError } = await supabase.from('custom_headers').insert({
        table_name: '_employeeOrder',
        headers: employeeOrder
      });
      if (orderError) throw orderError;
      console.log(">>> [SAVE-DEBUG] Employee order saved:", employeeOrder);
    }

    // --- Save Monthly Batch Admin ---
    if (monthlyBatchAdmin && Object.keys(monthlyBatchAdmin).length > 0) {
      await supabase.from('monthly_batch_admin_leads').delete().in('employee_id', employeeIds);
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

    // --- Save Webinar Leads ---
    if (webinarLeads) {
      const webinarLeadsToUpsert = [];
      for (const year in webinarLeads) {
        for (const month in webinarLeads[year]) {
          webinarLeadsToUpsert.push({ 
            year: year, 
            month: month, 
            lead_count: webinarLeads[year][month] 
          });
        }
      }
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
    
    // --- Save Employee Batches ---
    if (employeeBatches) {
      await supabase.from('employee_batches').delete().neq('id', 0);
      const batchAssignments = [];
      for (const empName in employeeBatches) {
        const empId = empIdMap[empName]; 
        if (!empId || !employeeBatches[empName]) continue;
        batchAssignments.push({ 
          employee_id: empId, 
          batch_id: employeeBatches[empName] 
        });
      }
      if (batchAssignments.length > 0) {
        const { error: insertError } = await supabase.from('employee_batches').insert(batchAssignments);
        if (insertError) throw insertError;
      }
    }
    
    // --- Save Batch-Month Mappings ---
    if (batchToMonthMapping) {
      const { error: deleteError } = await supabase.from('batch_month_mapping').delete().neq('id', 0);
      if (deleteError) throw deleteError;
      
      const mappingsToInsert = batchToMonthMapping.map(mapping => ({
        batch_index: mapping.batchIndex,
        batch_name: mapping.batchName,
        month_index: mapping.monthIndex,
        month_name: mapping.monthName,
        year: mapping.year || "2026"
      }));
      
      if (mappingsToInsert.length > 0) {
        const { error: insertError } = await supabase.from('batch_month_mapping').insert(mappingsToInsert);
        if (insertError) throw insertError;
      }
    }
    
    // --- Save Webinar Batch Data ---
    if (webinarData) {
      const { error: deleteError } = await supabase.from('webinar_data').delete().neq('id', 0);
      if (deleteError) throw deleteError;
      
      const webinarDataToInsert = [];
      for (const year in webinarData) {
        for (const batchName in webinarData[year]) {
          webinarDataToInsert.push({
            year: year,
            batch_name: batchName,
            lead_count: webinarData[year][batchName]
          });
        }
      }
      
      if (webinarDataToInsert.length > 0) {
        const { error: insertError } = await supabase.from('webinar_data').insert(webinarDataToInsert);
        if (insertError) throw insertError;
      }
    }

    // --- Save Webinar Performance Data ---
    if (webinarPerformanceData) {
      await supabase.from('webinar_performance').delete().in('employee_id', employeeIds);

      const perfDataToInsert = [];
      for (const year in webinarPerformanceData) {
        for (const empName in webinarPerformanceData[year]) {
          const empId = empIdMap[empName];
          if (!empId) continue;

          const monthlyData = webinarPerformanceData[year][empName];
          if (Array.isArray(monthlyData)) {
            monthlyData.forEach((val, monthIndex) => {
              perfDataToInsert.push({
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

      if (perfDataToInsert.length > 0) {
        const { error: perfInsertError } = await supabase.from('webinar_performance').insert(perfDataToInsert);
        if (perfInsertError) throw perfInsertError;
        console.log(`>>> [SAVE-DEBUG] Saved ${perfDataToInsert.length} webinar performance records.`);
      }
    }

    // --- Save Daily Webinar Performance Data (NEW) ---
    if (dailyWebinarPerformance) {
      await supabase.from('daily_webinar_performance').delete().in('employee_id', employeeIds);

      const dailyWebinarToUpsert = [];
      for (const empName in dailyWebinarPerformance) {
        const empId = empIdMap[empName];
        if (!empId) continue;
        
        for (const year in dailyWebinarPerformance[empName]) {
          for (const month in dailyWebinarPerformance[empName][year]) {
            for (const day in dailyWebinarPerformance[empName][year][month]) {
              dailyWebinarToUpsert.push({
                employee_id: empId,
                year: parseInt(year),
                month: parseInt(month),
                day: parseInt(day),
                value: dailyWebinarPerformance[empName][year][month][day]
              });
            }
          }
        }
      }

      if (dailyWebinarToUpsert.length > 0) {
        await upsertData('daily_webinar_performance', dailyWebinarToUpsert, 'employee_id, year, month, day');
        console.log(`>>> [SAVE-DEBUG] Saved ${dailyWebinarToUpsert.length} daily webinar performance records.`);
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

// Remove employee and all associated data
app.delete('/api/employee/:name', async (req, res) => {
  try {
    const { name } = req.params;
    
    if (!name) {
      return res.status(400).json({ error: 'Employee name is required' });
    }
    
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('id')
      .eq('name', name)
      .single();
      
    if (empError || !employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    const employeeId = employee.id;
    
    // Clean up the employee from the saved employeeOrder
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
      console.log(`>>> [DEBUG] Removed "${name}" from saved employee order.`);
    }
    
    const deleteOperations = [
      supabase.from('employee_batches').delete().eq('employee_id', employeeId),
      supabase.from('daily_bookings').delete().eq('employee_id', employeeId),
      supabase.from('lead_summary').delete().eq('employee_id', employeeId),
      supabase.from('monthly_leads').delete().eq('employee_id', employeeId),
      supabase.from('batch_leads').delete().eq('employee_id', employeeId),
      supabase.from('monthly_batch_admin_leads').delete().eq('employee_id', employeeId),
      supabase.from('webinar_performance').delete().eq('employee_id', employeeId),
      supabase.from('daily_webinar_performance').delete().eq('employee_id', employeeId) // NEW: Daily Webinar Performance
    ];
    
    for (const operation of deleteOperations) {
      const { error } = await operation;
      if (error) throw error;
    }
    
    const { error: deleteError } = await supabase
      .from('employees')
      .delete()
      .eq('id', employeeId);
      
    if (deleteError) throw deleteError;
    
    res.json({ success: true, message: `Employee "${name}" and all associated data have been removed` });
    
  } catch (error) {
    console.error('Error removing employee:', error);
    res.status(500).json({ 
      error: 'Failed to remove employee', 
      details: error.message 
    });
  }
});

// Start Server
app.listen(port, () => { 
  console.log(`Server is running on http://localhost:${port}`); 
});
