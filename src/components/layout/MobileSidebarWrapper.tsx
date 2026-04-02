"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

export function MobileSidebarWrapper({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on navigation
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Burger button — fixed on mobile */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed bottom-4 left-4 z-50 h-12 w-12 rounded-full bg-gray-900 text-white shadow-lg flex items-center justify-center hover:bg-gray-800 transition"
        aria-label="Menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Overlay + sidebar */}
      {open && (
        <>
          <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setOpen(false)} />
          <div className="md:hidden fixed inset-y-0 left-0 z-50 w-64 shadow-xl">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 z-10 h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200"
            >
              <X className="h-4 w-4" />
            </button>
            {children}
          </div>
        </>
      )}
    </>
  );
}
