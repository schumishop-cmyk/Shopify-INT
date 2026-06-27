import { useState, useEffect, useCallback } from 'react';

export function useRules(shop) {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const headers = { 'Content-Type': 'application/json', 'X-Shop-Domain': shop };

  const fetchRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/rules', { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRules(data.rules || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [shop]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const createRule = useCallback(async (body) => {
    const res = await fetch('/api/rules', { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Fehler beim Erstellen'); }
    const data = await res.json();
    setRules((prev) => [...prev, data.rule].sort((a, b) => a.priority - b.priority));
    return data.rule;
  }, [shop]);

  const updateRule = useCallback(async (id, body) => {
    const res = await fetch(`/api/rules/${id}`, { method: 'PUT', headers, body: JSON.stringify(body) });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Fehler beim Aktualisieren'); }
    const data = await res.json();
    setRules((prev) => prev.map((r) => r.id === id ? data.rule : r));
    return data.rule;
  }, [shop]);

  const deleteRule = useCallback(async (id) => {
    const res = await fetch(`/api/rules/${id}`, { method: 'DELETE', headers });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Fehler beim Löschen'); }
    setRules((prev) => prev.filter((r) => r.id !== id));
  }, [shop]);

  const toggleRule = useCallback(async (id) => {
    const res = await fetch(`/api/rules/${id}/toggle`, { method: 'POST', headers });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Fehler'); }
    const data = await res.json();
    setRules((prev) => prev.map((r) => r.id === id ? data.rule : r));
  }, [shop]);

  return { rules, loading, error, fetchRules, createRule, updateRule, deleteRule, toggleRule };
}
