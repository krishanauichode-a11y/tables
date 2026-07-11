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

// --- Start Server ---
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

// ============================================================
// API ROUTE: GET ALL SALES DATA
// ============================================================
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

    // Check for errors
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

    console.log(">>> [DEBUG] All data fetched. Formatting for frontend...");

    // --- Build the formatted response ---
    const formattedData = {
      employees: employees.map(e => e.name),
      employeeOrder: null,
      dailyBookings: {},
      dailyBookingsByYear: {},
      leadSummary: {},
      monthlyLeads: {},
      monthlyLeadsByYear: {},
      batchData: {
        employees: employees.map(e => e.name),
        batches: batches || [],
        batchLeads: {},
        thc: {}
      },
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

    // --- Process batch-to-month mappings ---
    if (batchMonthMapping && batchMonthMapping.length > 0) {
      formattedData.batchToMonthMapping = batchMonthMapping.map(mapping => ({
        batchIndex: mapping.batch_index,
        batchName: mapping.batch_name,
        monthIndex: mapping.month_index,
        monthName: mapping.month_name,
        year: mapping.year || "2026"
      }));
    }

    // --- Process employee batches ---
    employees.forEach(emp => {
      const batchAssignment = employeeBatches.find(b => b.employee_id === emp.id);
      formattedData.employeeBatches[emp.name] = batchAssignment ? batchAssignment.batch_id : null;
    });

    // --- Process custom headers ---
    if (customHeaders && customHeaders.length > 0) {
      customHeaders.forEach(header => {
        if (header.table_name === '_employeeOrder') {
          formattedData.employeeOrder = header.headers;
        } else if (header.table_name && header.headers) {
          formattedData.customHeaders[header.table_name] = header.headers;
        }
      });
    }

    // --- Process daily bookings ---
    employees.forEach(emp => {
      formattedData.dailyBookings[emp.name] = {};
      formattedData.dailyBookingsByYear[emp.name] = {};

      const empDailyBookings = dailyBookings.filter(d => d.employee_id === emp.id);
      empDailyBookings.forEach(booking => {
        const year = String(booking.year || "2026");
        const month = booking.month;
        const day = booking.day;
        const value = booking.value || 0;

        // Legacy format (no year)
        if (!formattedData.dailyBookings[emp.name][month]) {
          formattedData.dailyBookings[emp.name][month] = {};
        }
        formattedData.dailyBookings[emp.name][month][day] = value;

        // Year-based format
        if (!formattedData.dailyBookingsByYear[emp.name][year]) {
          formattedData.dailyBookingsByYear[emp.name][year] = {};
        }
        if (!formattedData.dailyBookingsByYear[emp.name][year][month]) {
          formattedData.dailyBookingsByYear[emp.name][year][month] = {};
        }
        formattedData.dailyBookingsByYear[emp.name][year][month][day] = value;
      });
    });

    // --- Process lead summary ---
    employees.forEach(emp => {
      formattedData.leadSummary[emp.name] = {};
      // Initialize all 12 months with zeros
      for (let month = 0; month < 12; month++) {
        formattedData.leadSummary[emp.name][month] = { pre: 0, off: 0, rep: 0, app: 0, bas: 0, adv: 0, att: 0 };
      }
      // Fill in actual data
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

    // --- Process monthly leads ---
    employees.forEach(emp => {
      const empMonthly = monthlyLeads.filter(m => m.employee_id === emp.id);
      formattedData.monthlyLeads[emp.name] = Array(12).fill(0);
      formattedData.monthlyLeadsByYear[emp.name] = {};

      empMonthly.forEach(month => {
        const year = String(month.year || "2026");
        const monthIdx = month.month;
        const value = month.value || 0;

        // Legacy format
        formattedData.monthlyLeads[emp.name][monthIdx] = value;

        // Year-based format
        if (!formattedData.monthlyLeadsByYear[emp.name][year]) {
          formattedData.monthlyLeadsByYear[emp.name][year] = Array(12).fill(0);
        }
        formattedData.monthlyLeadsByYear[emp.name][year][monthIdx] = value;
      });
    });

    // --- Process batch data ---
    employees.forEach(emp => {
      formattedData.batchData.batchLeads[emp.name] = {};
      batches.forEach(batch => {
        const batchLead = batchLeads.find(bl => bl.employee_id === emp.id && bl.batch_id === batch.id);
        formattedData.batchData.batchLeads[emp.name][batch.id] = batchLead ? batchLead.value : 0;
      });
    });
    // THC values
    batches.forEach(b => {
      formattedData.batchData.thc[b.id] = b.thc || 0;
    });

    // --- Process monthly batch admin ---
    employees.forEach(emp => {
      const adminData = monthlyBatchAdmin.find(m => m.employee_id === emp.id);
      if (adminData) {
        formattedData.monthlyBatchAdmin[emp.name] = [
          adminData.lead_10_jul || 0,
          adminData.lead_29_jul || 0,
          adminData.lead_jul || 0,
          adminData.lead_19_aug || 0,
          adminData.lead_aug || 0,
          adminData.lead_16_sep || 0,
          adminData.lead_sep || 0,
          adminData.lead_13_oct || 0,
          adminData.lead_oct || 0,
          adminData.lead_nov || 0,
          adminData.lead_dec || 0,
          adminData.lead_jan || 0,
          adminData.lead_10_nov || 0,
          adminData.lead_20_nov || 0,
          adminData.lead_14_dec || 0
        ];
      } else {
        formattedData.monthlyBatchAdmin[emp.name] = Array(15).fill(0);
      }
    });

    // --- Process webinar leads ---
    formattedData.webinarLeads = {};
    if (webinarLeads && webinarLeads.length > 0) {
      webinarLeads.forEach(item => {
        const year = String(item.year || "2026");
        if (!formattedData.webinarLeads[year]) {
          formattedData.webinarLeads[year] = {};
        }
        formattedData.webinarLeads[year][item.month] = item.lead_count || 0;
      });
    }

    // --- Process webinar batch data ---
    formattedData.webinarData = {};
    if (webinarData && webinarData.length > 0) {
      webinarData.forEach(item => {
        const year = String(item.year || "2026");
        if (!formattedData.webinarData[year]) {
          formattedData.webinarData[year] = {};
        }
        formattedData.webinarData[year][item.batch_name] = item.lead_count || 0;
      });
    }

    // --- Process webinar performance data ---
    formattedData.webinarPerformanceData = {};
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
          formattedData.webinarPerformanceData[year][empName][item.month] = item.lead_count || 0;
        }
      });
    }

    // --- Process daily webinar performance data ---
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
        formattedData.webinarDailyData[year][emp.name][entry.month][entry.day] = entry.value || 0;
      });
    });

    console.log(">>> [DEBUG] Data formatted. Sending response.");
    res.json(formattedData);

  } catch (error) {
    console.error('!!! [DEBUG] ERROR IN /api/sales !!!', error);
    res.status(500).json({ error: 'Failed to fetch sales data', details: error.message });
  }
});


// ============================================================
// API ROUTE: SAVE ALL SALES DATA
// ============================================================
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
      webinarDailyData
    } = req.body;

    console.log(">>> [SAVE-DEBUG] Received request to save data.");

    // --- Helper: Build employee ID map ---
    const empIdMap = {};
    for (const empName of (employees || [])) {
      const { data: existingEmp, error: empError } = await supabase
        .from('employees')
        .select('id')
        .eq('name', empName)
        .single();

      if (empError && empError.code !== 'PGRST116') throw empError;

      if (existingEmp) {
        empIdMap[empName] = existingEmp.id;
      } else {
        const { data: newEmp, error: insertError } = await supabase
          .from('employees')
          .insert({ name: empName })
          .select('id')
          .single();

        if (insertError) throw insertError;
        empIdMap[empName] = newEmp.id;
      }
    }

    const employeeIds = Object.values(empIdMap);

    // --- Helper: Upsert data ---
    const upsertData = async (table, data, conflictColumns) => {
      if (!data || data.length === 0) return;
      const { error } = await supabase.from(table).upsert(data, { onConflict: conflictColumns });
      if (error) throw error;
    };

    // =============================================
    // 1. SAVE DAILY BOOKINGS
    // =============================================
    const dailyBookingsToUpsert = [];

    // Legacy format (no year)
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
              value: dailyBookings[empName][month][day] || 0,
              year: "2026"
            });
          }
        }
      }
    }

    // Year-based format (overrides legacy if present)
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
                value: dailyBookingsByYear[empName][year][month][day] || 0,
                year: year
              });
            }
          }
        }
      }
    }

    // Delete existing and re-insert
    if (employeeIds.length > 0) {
      await supabase.from('daily_bookings').delete().in('employee_id', employeeIds);
    }
    if (dailyBookingsToUpsert.length > 0) {
      await upsertData('daily_bookings', dailyBookingsToUpsert, 'employee_id,month,day,year');
      console.log(`>>> [SAVE-DEBUG] Saved ${dailyBookingsToUpsert.length} daily booking records.`);
    }

    // =============================================
    // 2. SAVE LEAD SUMMARY
    // =============================================
    const leadSummaryToUpsert = [];
    if (leadSummary) {
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
    }
    if (leadSummaryToUpsert.length > 0) {
      await upsertData('lead_summary', leadSummaryToUpsert, 'employee_id,month');
      console.log(`>>> [SAVE-DEBUG] Saved ${leadSummaryToUpsert.length} lead summary records.`);
    }

    // =============================================
    // 3. SAVE MONTHLY LEADS
    // =============================================
    const monthlyLeadsToUpsert = [];

    // Legacy format
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

    // Year-based format
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

    if (employeeIds.length > 0) {
      await supabase.from('monthly_leads').delete().in('employee_id', employeeIds);
    }
    if (monthlyLeadsToUpsert.length > 0) {
      await upsertData('monthly_leads', monthlyLeadsToUpsert, 'employee_id,month,year');
      console.log(`>>> [SAVE-DEBUG] Saved ${monthlyLeadsToUpsert.length} monthly lead records.`);
    }

    // =============================================
    // 4. SAVE BATCH DATA
    // =============================================
    if (batchData) {
      // Save batch definitions (id, label, thc)
      const batchesToUpsert = (batchData.batches || []).map(batch => ({
        id: batch.id,
        label: batch.label,
        thc: batchData.thc[batch.id] || 0
      }));
      if (batchesToUpsert.length > 0) {
        await upsertData('batches', batchesToUpsert, 'id');
        console.log(`>>> [SAVE-DEBUG] Saved ${batchesToUpsert.length} batch definitions.`);
      }

      // Save batch leads per employee
      const batchLeadsToUpsert = [];
      if (batchData.batchLeads) {
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
      }
      if (batchLeadsToUpsert.length > 0) {
        await upsertData('batch_leads', batchLeadsToUpsert, 'employee_id,batch_id');
        console.log(`>>> [SAVE-DEBUG] Saved ${batchLeadsToUpsert.length} batch lead records.`);
      }
    }

    // =============================================
    // 5. SAVE CUSTOM HEADERS
    // =============================================
    if (customHeaders) {
      // Delete all existing headers first
      const { error: deleteHeadersError } = await supabase.from('custom_headers').delete().neq('id', 0);
      if (deleteHeadersError) throw deleteHeadersError;

      const headersToInsert = [];
      for (const tableName in customHeaders) {
        // Skip internal keys that aren't table names
        if (tableName.startsWith('_')) continue;
        headersToInsert.push({
          table_name: tableName,
          headers: customHeaders[tableName]
        });
      }

      if (headersToInsert.length > 0) {
        const { error: insertHeadersError } = await supabase.from('custom_headers').insert(headersToInsert);
        if (insertHeadersError) throw insertHeadersError;
        console.log(`>>> [SAVE-DEBUG] Saved ${headersToInsert.length} custom header records.`);
      }
    }

    // =============================================
    // 6. SAVE EMPLOYEE ORDER
    // =============================================
    if (employeeOrder && Array.isArray(employeeOrder)) {
      const { error: orderError } = await supabase.from('custom_headers').insert({
        table_name: '_employeeOrder',
        headers: employeeOrder
      });
      if (orderError) throw orderError;
      console.log(">>> [SAVE-DEBUG] Employee order saved:", employeeOrder);
    }

    // =============================================
    // 7. SAVE MONTHLY BATCH ADMIN
    // =============================================
    if (monthlyBatchAdmin && Object.keys(monthlyBatchAdmin).length > 0) {
      if (employeeIds.length > 0) {
        await supabase.from('monthly_batch_admin_leads').delete().in('employee_id', employeeIds);
      }

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
        console.log(`>>> [SAVE-DEBUG] Saved ${adminDataToInsert.length} monthly batch admin records.`);
      }
    }

    // =============================================
    // 8. SAVE WEBINAR LEADS
    // =============================================
    if (webinarLeads) {
      const yearsToUpdate = Object.keys(webinarLeads);
      for (const year of yearsToUpdate) {
        await supabase.from('webinar_leads').delete().eq('year', year);
      }

      const webinarLeadsToUpsert = [];
      for (const year in webinarLeads) {
        for (const month in webinarLeads[year]) {
          webinarLeadsToUpsert.push({
            year: year,
            month: parseInt(month),
            lead_count: webinarLeads[year][month] || 0
          });
        }
      }
      if (webinarLeadsToUpsert.length > 0) {
        const { error: webinarError } = await supabase.from('webinar_leads').insert(webinarLeadsToUpsert);
        if (webinarError) throw webinarError;
        console.log(`>>> [SAVE-DEBUG] Saved ${webinarLeadsToUpsert.length} webinar lead records.`);
      }
    }

    // =============================================
    // 9. SAVE EMPLOYEE BATCHES
    // =============================================
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
        console.log(`>>> [SAVE-DEBUG] Saved ${batchAssignments.length} employee batch assignments.`);
      }
    }

    // =============================================
    // 10. SAVE BATCH-MONTH MAPPINGS
    // =============================================
    if (batchToMonthMapping) {
      await supabase.from('batch_month_mapping').delete().neq('id', 0);

      const mappingsToInsert = batchToMonthMapping.map(mapping => ({
        batch_index: mapping.batchIndex,
        batch_name: mapping.batchName,
        month_index: mapping.monthIndex,
        month_name: mapping.monthName,
        year: String(mapping.year || "2026")
      }));

      if (mappingsToInsert.length > 0) {
        const { error: insertError } = await supabase.from('batch_month_mapping').insert(mappingsToInsert);
        if (insertError) throw insertError;
        console.log(`>>> [SAVE-DEBUG] Saved ${mappingsToInsert.length} batch-month mappings.`);
      }
    }

    // =============================================
    // 11. SAVE WEBINAR BATCH DATA
    // =============================================
    if (webinarData) {
      await supabase.from('webinar_data').delete().neq('id', 0);

      const webinarDataToInsert = [];
      for (const year in webinarData) {
        for (const batchName in webinarData[year]) {
          webinarDataToInsert.push({
            year: year,
            batch_name: batchName,
            lead_count: webinarData[year][batchName] || 0
          });
        }
      }
      if (webinarDataToInsert.length > 0) {
        const { error: insertError } = await supabase.from('webinar_data').insert(webinarDataToInsert);
        if (insertError) throw insertError;
        console.log(`>>> [SAVE-DEBUG] Saved ${webinarDataToInsert.length} webinar batch data records.`);
      }
    }

    // =============================================
    // 12. SAVE WEBINAR PERFORMANCE DATA
    // =============================================
    if (webinarPerformanceData) {
      if (employeeIds.length > 0) {
        await supabase.from('webinar_performance').delete().in('employee_id', employeeIds);
      }

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

    // =============================================
    // 13. SAVE DAILY WEBINAR PERFORMANCE DATA
    // =============================================
    if (webinarDailyData) {
      if (employeeIds.length > 0) {
        await supabase.from('daily_webinar_performance').delete().in('employee_id', employeeIds);
      }

      const dailyWebinarToUpsert = [];
      for (const year in webinarDailyData) {
        for (const empName in webinarDailyData[year]) {
          const empId = empIdMap[empName];
          if (!empId) continue;

          for (const month in webinarDailyData[year][empName]) {
            for (const day in webinarDailyData[year][empName][month]) {
              dailyWebinarToUpsert.push({
                employee_id: empId,
                year: parseInt(year),
                month: parseInt(month),
                day: parseInt(day),
                value: webinarDailyData[year][empName][month][day] || 0
              });
            }
          }
        }
      }
      if (dailyWebinarToUpsert.length > 0) {
        await upsertData('daily_webinar_performance', dailyWebinarToUpsert, 'employee_id,year,month,day');
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


// ============================================================
// API ROUTE: ADD NEW EMPLOYEE
// ============================================================
app.post('/api/employee', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Employee name is required' });
    }

    const { data, error } = await supabase
      .from('employees')
      .insert({ name: name })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Employee with this name already exists' });
      }
      throw error;
    }

    console.log(`>>> [DEBUG] Employee "${name}" added with ID: ${data.id}`);
    res.json({ success: true, employee: data });

  } catch (error) {
    console.error('Error adding employee:', error);
    res.status(500).json({ error: 'Failed to add employee', details: error.message });
  }
});


// ============================================================
// API ROUTE: REMOVE EMPLOYEE (HISTORICAL DATA PRESERVED)
// ============================================================
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

    // Step 1: Remove from employee order list
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
      console.log(`>>> [DEBUG] Removed "${name}" from employee order.`);
    }

    // Step 2: Remove current batch assignment only
    const { error: batchAssignError } = await supabase
      .from('employee_batches')
      .delete()
      .eq('employee_id', employeeId);

    if (batchAssignError) {
      console.warn(`>>> [DEBUG] Warning: Could not remove batch assignment: ${batchAssignError.message}`);
    } else {
      console.log(`>>> [DEBUG] Removed batch assignment for "${name}".`);
    }

    // Step 3: Delete the employee record
    const { error: deleteError } = await supabase
      .from('employees')
      .delete()
      .eq('id', employeeId);

    if (deleteError) throw deleteError;

    // ============================================
    // HISTORICAL DATA PRESERVED - NOT DELETED:
    // ============================================
    // ✅ daily_bookings             - Past daily data kept
    // ✅ lead_summary                - Past summaries kept
    // ✅ monthly_leads               - Past monthly totals kept
    // ✅ batch_leads                 - Past batch data kept
    // ✅ monthly_batch_admin_leads  - Past admin data kept
    // ✅ webinar_performance         - Past webinar data kept
    // ✅ daily_webinar_performance   - Past daily webinar data kept
    // ============================================

    console.log(`>>> [DEBUG] Employee "${name}" removed. All historical data preserved.`);

    res.json({
      success: true,
      message: `Employee "${name}" removed from active list. All historical data has been preserved.`
    });

  } catch (error) {
    console.error('Error removing employee:', error);
    res.status(500).json({
      error: 'Failed to remove employee',
      details: error.message
    });
  }
});


// ============================================================
// HEALTH CHECK ROUTE
// ============================================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});
