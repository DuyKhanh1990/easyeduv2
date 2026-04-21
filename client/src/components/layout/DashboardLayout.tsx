import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { motion } from "framer-motion";

export function DashboardLayout({ children, fullscreen }: { children: ReactNode; fullscreen?: boolean }) {
  const { data: user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAFC]">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <Header />
        {fullscreen ? (
          <div className="flex-1 overflow-hidden">
            {children}
          </div>
        ) : (
          <main className="flex-1 overflow-y-auto scroll-smooth">
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="h-full w-full p-4 md:p-6 lg:p-8"
            >
              {children}
            </motion.div>
          </main>
        )}
      </div>
    </div>
  );
}
