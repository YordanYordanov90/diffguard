import { shadcn } from "@clerk/ui/themes";

/**
 * DiffGuard Clerk appearance — maps project tokens from ui-context.md.
 * Hex values are intentional: Clerk recommends direct colors for browser support.
 * Visual language: Sphere-style rounded surfaces, soft borders, green CTA.
 */
export const clerkAppearance = {
  theme: shadcn,
  variables: {
    colorPrimary: "#22c55e",
    colorPrimaryForeground: "#0a0a0b",
    colorBackground: "#141416",
    colorForeground: "#f4f4f5",
    colorMuted: "#1c1c1f",
    colorMutedForeground: "#a1a1aa",
    colorInput: "#0a0a0b",
    colorInputForeground: "#f4f4f5",
    colorBorder: "#27272a",
    colorNeutral: "#a1a1aa",
    colorDanger: "#ef4444",
    colorSuccess: "#22c55e",
    colorWarning: "#f59e0b",
    colorRing: "#22c55e",
    colorShadow: "#000000",
    borderRadius: "0.875rem",
    fontFamily: "var(--font-geist-sans)",
    fontFamilyButtons: "var(--font-geist-sans)",
    fontFamilyMono: "var(--font-geist-mono)",
  },
  options: {
    socialButtonsVariant: "blockButton" as const,
    socialButtonsPlacement: "top" as const,
  },
  elements: {
    rootBox: "w-full mx-auto",
    cardBox: "w-full shadow-none",
    card:
      "bg-[#141416]/55 border border-[#27272a] rounded-[1.75rem] shadow-none backdrop-blur-sm px-2 py-2",
    header: "hidden",
    headerTitle: "hidden",
    headerSubtitle: "hidden",
    socialButtonsBlockButton:
      "bg-transparent border border-[#22c55e]/45 text-[#f4f4f5] rounded-full hover:bg-[#22c55e]/10 transition-colors h-11",
    socialButtonsBlockButtonText: "text-[#f4f4f5] font-medium",
    dividerLine: "bg-[#27272a]",
    dividerText: "text-[#a1a1aa]",
    formFieldLabel: "text-[#a1a1aa] text-sm",
    formFieldInput:
      "bg-[#0a0a0b]/80 border border-[#27272a] text-[#f4f4f5] rounded-full h-11 px-4 placeholder:text-[#a1a1aa] focus:border-[#22c55e] focus:ring-[#22c55e]/30",
    formButtonPrimary:
      "bg-[#22c55e] text-[#0a0a0b] rounded-full h-11 font-semibold shadow-[0_0_24px_rgba(34,197,94,0.25)] hover:bg-[#16a34a] transition-colors",
    footerActionLink: "text-[#22c55e] hover:text-[#4ade80]",
    identityPreviewEditButton: "text-[#22c55e]",
    formFieldInputShowPasswordButton: "text-[#a1a1aa] hover:text-[#f4f4f5]",
    alternativeMethodsBlockButton:
      "bg-[#1c1c1f] border border-[#27272a] text-[#f4f4f5] rounded-full",
    otpCodeFieldInput:
      "bg-[#0a0a0b] border border-[#27272a] text-[#f4f4f5] rounded-lg",
    footer: "bg-transparent",
    footerAction: "text-[#a1a1aa]",
  },
};
