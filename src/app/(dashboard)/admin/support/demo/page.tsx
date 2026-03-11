"use client";

import { Monitor, ExternalLink } from "lucide-react";

export default function DemoPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Demander une démo</h1>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
        <div className="w-16 h-16 bg-[#e0f5f8] rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Monitor className="w-8 h-8 text-[#3DB5C5]" />
        </div>

        <p className="text-gray-700 text-base leading-relaxed mb-2">
          Nos démos sont des réunions en visio individuelles
          pour répondre à toutes vos questions
        </p>

        <p className="text-gray-500 text-sm mb-8">
          Cliquez sur le bouton ci-dessous pour choisir un créneau qui vous convient
        </p>

        <a
          href="https://calendly.com/visioformation-fr"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-semibold text-sm transition-all hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #3DB5C5, #2a9aaa)" }}
        >
          Demander une démo
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}
