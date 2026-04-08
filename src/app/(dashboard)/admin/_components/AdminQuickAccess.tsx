"use client";

import Link from "next/link";
import { QUICK_ACCESS } from "./constants";

export function AdminQuickAccess() {
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
        Accès Rapide
      </h2>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12">
        {QUICK_ACCESS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-2 rounded-lg bg-white border border-gray-200 p-3 text-center shadow-sm hover:shadow-md hover:border-[#374151] transition-all duration-200 group"
            >
              <div
                className="flex h-9 w-9 items-center justify-center rounded-lg"
                style={{ backgroundColor: "#e0f5f7" }}
              >
                <Icon className="h-4 w-4" style={{ color: "#374151" }} />
              </div>
              <span className="text-[10px] font-medium leading-tight text-gray-600 group-hover:text-[#374151]">
                {item.title}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
