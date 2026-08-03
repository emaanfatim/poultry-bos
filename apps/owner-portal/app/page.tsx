"use client";

import { AuthGuard } from "./components/AuthGuard";
import { Header } from "./components/Header";
import Link from "next/link";

export default function Home() {
  return (
    <AuthGuard>
      <Header />
      <div className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="mb-2 text-2xl font-bold text-slate-900">Owner Portal</h1>
        <p className="mb-8 text-sm text-slate-500">Manage your branch from here.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/dashboard/categories"
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
          >
            <h2 className="text-base font-semibold text-slate-800">Categories</h2>
            <p className="mt-1 text-sm text-slate-500">
              Manage product categories and subcategories.
            </p>
          </Link>
          <Link
            href="/dashboard/products"
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
          >
            <h2 className="text-base font-semibold text-slate-800">Products</h2>
            <p className="mt-1 text-sm text-slate-500">
              Add products and set their prices, units, and availability.
            </p>
          </Link>
          <Link
            href="/dashboard/staff/discounts"
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
          >
            <h2 className="text-base font-semibold text-slate-800">Staff · Discounts</h2>
            <p className="mt-1 text-sm text-slate-500">
              Control which cashiers can apply discounts, and how much.
            </p>
          </Link>
        </div>
      </div>
    </AuthGuard>
  );
}
