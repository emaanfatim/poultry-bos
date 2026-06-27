"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../../providers/AuthProvider";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SubCategory {
  id: string;
  name: string;
  token: string;
}

interface Category {
  id: string;
  name: string;
  token: string;
  subCategories: SubCategory[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getToken() {
  return localStorage.getItem("token") ?? "";
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error ?? "Request failed");
  }
  return res.json();
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CategoriesPage() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // New category form
  const [newCatName, setNewCatName] = useState("");
  const [newCatToken, setNewCatToken] = useState("");
  const [catSaving, setCatSaving] = useState(false);

  // Per-category: subcategory form state
  const [subForms, setSubForms] = useState<
    Record<string, { name: string; token: string; saving: boolean; open: boolean }>
  >({});

  // Block non-owners
  if (user?.role !== "owner") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-slate-500">Access denied — owners only.</p>
      </div>
    );
  }

  // ─── Fetch ──────────────────────────────────────────────────────────────

  async function load() {
    try {
      const data: Category[] = await apiFetch("/api/categories");
      setCategories(data);

      // Init subform state for any new categories
      setSubForms((prev) => {
        const next = { ...prev };
        for (const cat of data) {
          if (!next[cat.id]) {
            next[cat.id] = { name: "", token: "", saving: false, open: false };
          }
        }
        return next;
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Category Actions ────────────────────────────────────────────────────

  async function createCategory() {
    if (!newCatName.trim() || !newCatToken.trim()) return;
    setCatSaving(true);
    setError("");
    try {
      await apiFetch("/api/categories", {
        method: "POST",
        body: JSON.stringify({ name: newCatName.trim(), token: newCatToken.trim() }),
      });
      setNewCatName("");
      setNewCatToken("");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create category");
    } finally {
      setCatSaving(false);
    }
  }

  async function deleteCategory(id: string) {
    if (!confirm("Delete this category and all its subcategories?")) return;
    setError("");
    try {
      await apiFetch(`/api/categories/${id}`, { method: "DELETE" });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete category");
    }
  }

  // ─── Subcategory Actions ─────────────────────────────────────────────────

  function updateSubForm(
    catId: string,
    patch: Partial<{ name: string; token: string; saving: boolean; open: boolean }>
  ) {
    setSubForms((prev) => ({
      ...prev,
      [catId]: { ...prev[catId]!, ...patch },
    }));
  }

  async function createSubCategory(catId: string) {
    const form = subForms[catId];
    if (!form?.name.trim() || !form?.token.trim()) return;
    updateSubForm(catId, { saving: true });
    setError("");
    try {
      await apiFetch("/api/categories/subcategories", {
        method: "POST",
        body: JSON.stringify({
          categoryId: catId,
          name: form.name.trim(),
          token: form.token.trim(),
        }),
      });
      updateSubForm(catId, { name: "", token: "", saving: false, open: false });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create subcategory");
      updateSubForm(catId, { saving: false });
    }
  }

  async function deleteSubCategory(id: string) {
    if (!confirm("Delete this subcategory?")) return;
    setError("");
    try {
      await apiFetch(`/api/categories/subcategories/${id}`, { method: "DELETE" });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete subcategory");
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Categories</h1>
      <p className="mb-8 text-sm text-slate-500">
        Manage product categories and their subcategories.
      </p>

      {/* Error banner */}
      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Create Category Form ── */}
      <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-slate-800">
          New Category
        </h2>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Name (e.g. Live Products)"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
          <input
            type="text"
            placeholder="Token (e.g. CG2)"
            value={newCatToken}
            onChange={(e) => setNewCatToken(e.target.value)}
            className="w-28 rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
          <button
            type="button"
            onClick={createCategory}
            disabled={catSaving || !newCatName.trim() || !newCatToken.trim()}
            className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {catSaving ? "Saving…" : "Add Category"}
          </button>
        </div>
      </div>

      {/* ── Category List ── */}
      {loading ? (
        <div className="text-center text-slate-400">Loading…</div>
      ) : categories.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
          No categories yet. Create one above.
        </div>
      ) : (
        <div className="space-y-4">
          {categories.map((cat) => {
            const form = subForms[cat.id] ?? {
              name: "",
              token: "",
              saving: false,
              open: false,
            };

            return (
              <div
                key={cat.id}
                className="rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                {/* Category Header */}
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <div>
                    <span className="mr-2 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      {cat.token}
                    </span>
                    <span className="font-semibold text-slate-900">{cat.name}</span>
                    <span className="ml-2 text-xs text-slate-400">
                      {cat.subCategories.length} subcategor
                      {cat.subCategories.length === 1 ? "y" : "ies"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteCategory(cat.id)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Delete
                  </button>
                </div>

                {/* Subcategory List */}
                <div className="px-5 py-3">
                  {cat.subCategories.length === 0 ? (
                    <p className="py-2 text-xs text-slate-400">
                      No subcategories yet.
                    </p>
                  ) : (
                    <ul className="mb-3 space-y-2">
                      {cat.subCategories.map((sub) => (
                        <li
                          key={sub.id}
                          className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
                        >
                          <div>
                            <span className="mr-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                              {sub.token}
                            </span>
                            <span className="text-sm text-slate-800">{sub.name}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => deleteSubCategory(sub.id)}
                            className="text-xs text-red-400 hover:text-red-600"
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Add Subcategory Toggle */}
                  {!form.open ? (
                    <button
                      type="button"
                      onClick={() => updateSubForm(cat.id, { open: true })}
                      className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
                    >
                      + Add Subcategory
                    </button>
                  ) : (
                    <div className="flex gap-2 pt-1">
                      <input
                        type="text"
                        placeholder="Name (e.g. Live Bird)"
                        value={form.name}
                        onChange={(e) =>
                          updateSubForm(cat.id, { name: e.target.value })
                        }
                        className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                      />
                      <input
                        type="text"
                        placeholder="Token (e.g. SC2)"
                        value={form.token}
                        onChange={(e) =>
                          updateSubForm(cat.id, { token: e.target.value })
                        }
                        className="w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                      />
                      <button
                        type="button"
                        onClick={() => createSubCategory(cat.id)}
                        disabled={
                          form.saving || !form.name.trim() || !form.token.trim()
                        }
                        className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {form.saving ? "…" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateSubForm(cat.id, { open: false, name: "", token: "" })
                        }
                        className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}