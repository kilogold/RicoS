import type { Viewport } from "next";

export const viewport: Viewport = {
  themeColor: "#07182b",
  viewportFit: "cover",
};

export default function AdminOrderTestLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
