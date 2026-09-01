import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../integrations/supabase/client";

export function useHrOperations(tenantId, seedEmployees = []) {
  const [employees, setEmployees] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      let [employeeRes, eventRes] = await Promise.all([
        supabase.from("employees")
          .select("id,full_name,position,department,email,phone,salary,status")
          .eq("tenant_id", tenantId)
          .order("full_name")
          .limit(500),
        supabase.from("employee_events")
          .select("id,employee_id,event_type,status,start_date,end_date,amount,payload,created_at")
          .eq("tenant_id", tenantId)
          .order("start_date", { ascending: false, nullsFirst: false })
          .limit(1000),
      ]);
      if (employeeRes.error) throw employeeRes.error;
      if (eventRes.error) throw eventRes.error;

      if (!(employeeRes.data || []).length && seedEmployees.length) {
        const uniqueEmployees = [...new Map(seedEmployees
          .filter((employee) => String(employee.name || employee.full_name || "").trim())
          .map((employee) => {
            const fullName = String(employee.name || employee.full_name).trim();
            return [fullName.toLocaleLowerCase("az-AZ"), {
              tenant_id: tenantId,
              full_name: fullName,
              position: employee.position || null,
              department: employee.department || null,
              email: employee.email || null,
              phone: employee.phone || null,
              salary: Number(employee.salary || 0),
              status: "active",
            }];
          })).values()];

        if (uniqueEmployees.length) {
          const seedResult = await supabase.from("employees").insert(uniqueEmployees);
          if (seedResult.error) throw seedResult.error;
          employeeRes = await supabase.from("employees")
            .select("id,full_name,position,department,email,phone,salary,status")
            .eq("tenant_id", tenantId)
            .order("full_name")
            .limit(500);
          if (employeeRes.error) throw employeeRes.error;
        }
      }
      setEmployees(employeeRes.data || []);
      setEvents(eventRes.data || []);
      setError(null);
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }, [seedEmployees, tenantId]);

  useEffect(() => { refresh(); }, [refresh]);

  const createEvent = useCallback(async (event) => {
    if (!tenantId) throw new Error("Aktiv şirkət yoxdur");
    const { error: insertError } = await supabase.from("employee_events").insert({
      tenant_id: tenantId,
      employee_id: event.employeeId,
      event_type: event.eventType,
      status: event.status || "draft",
      start_date: event.startDate || null,
      end_date: event.endDate || null,
      amount: Number(event.amount || 0),
      payload: event.payload || {},
    });
    if (insertError) throw insertError;
    await refresh();
  }, [tenantId, refresh]);

  const updateEventStatus = useCallback(async (eventId, status) => {
    const { error: updateError } = await supabase.from("employee_events")
      .update({ status, approved_at: status === "approved" ? new Date().toISOString() : null })
      .eq("id", eventId);
    if (updateError) throw updateError;
    await refresh();
  }, [refresh]);

  const byType = useMemo(() => ({
    attendance: events.filter((row) => row.event_type === "attendance"),
    leave: events.filter((row) => row.event_type === "leave"),
    payroll: events.filter((row) => row.event_type === "payroll"),
    performance: events.filter((row) => row.event_type === "performance"),
    document: events.filter((row) => row.event_type === "document"),
  }), [events]);

  const employeeMap = useMemo(
    () => Object.fromEntries(employees.map((employee) => [employee.id, employee])),
    [employees],
  );

  return { employees, employeeMap, events, byType, loading, error, refresh, createEvent, updateEventStatus };
}
