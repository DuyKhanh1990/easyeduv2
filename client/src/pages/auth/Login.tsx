import { useState, useEffect } from "react";
import { useLogin, useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, EyeOff, GraduationCap } from "lucide-react";
import { motion } from "framer-motion";
import { useLanguage } from "@/hooks/use-language";
import { RegistrationFormDialog } from "@/components/registration/RegistrationFormDialog";

export function Login() {
  const { data: user } = useAuth();
  const login = useLogin();
  const { lang, setLang, t } = useLanguage();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mainLogo, setMainLogo] = useState<string | null>(null);
  const [regOpen, setRegOpen] = useState(false);

  useEffect(() => {
    fetch("/api/public/main-location")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.logoUrl) setMainLogo(data.logoUrl); })
      .catch(() => {});
  }, []);

  if (user) return <Redirect to="/" />;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate({ username, password });
  };

  return (
    <div className="min-h-screen w-full flex">
      {/* Left side - Form */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center px-8 sm:px-12 lg:px-24 bg-background relative z-10 overflow-hidden">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="w-full max-w-md flex flex-col gap-4"
        >
          {/* Logo + heading */}
          <div className="flex flex-col items-center text-center gap-1.5">
            {mainLogo ? (
              <img src={mainLogo} alt="Logo" className="h-32 max-w-[280px] object-contain" />
            ) : null}
            <h1 className="text-xl font-bold font-display tracking-tight text-foreground">
              {t("login.welcome")}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t("login.subtitle")}
            </p>
          </div>

          {/* Form card */}
          <div className="bg-card px-7 py-6 rounded-3xl border border-border shadow-2xl shadow-black/5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-sm font-semibold text-foreground">{t("login.username")}</Label>
                <Input 
                  id="username"
                  type="text" 
                  placeholder="admin"
                  required 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="h-11 px-4 rounded-xl bg-background border-border focus-visible:ring-primary/20 transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-semibold text-foreground">{t("login.password")}</Label>
                  <a href="#" className="text-xs font-medium text-primary hover:text-primary/80 transition-colors">
                    {t("login.forgot")}
                  </a>
                </div>
                <div className="relative">
                  <Input 
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    required 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 px-4 pr-12 rounded-xl bg-background border-border focus-visible:ring-primary/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
              <Button 
                type="submit" 
                disabled={login.isPending}
                className="w-full h-11 rounded-xl font-bold text-base bg-gradient-to-r from-primary to-primary/90 hover:shadow-lg hover:shadow-primary/30 transition-all duration-300 mt-1"
              >
                {login.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : t("login.submit")}
              </Button>
            </form>
          </div>

          {/* Registration CTA */}
          <div
            onClick={() => setRegOpen(true)}
            className="group flex items-center justify-between gap-3 px-5 py-3.5 rounded-2xl border border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 hover:border-primary/70 transition-all duration-300 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center transition-colors flex-shrink-0">
                <GraduationCap className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground leading-tight">Đăng ký tư vấn khóa học</p>
                <p className="text-xs text-muted-foreground">Điền thông tin để được liên hệ miễn phí</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary bg-primary/10 group-hover:bg-primary/20 px-3 py-1.5 rounded-full transition-colors whitespace-nowrap flex-shrink-0">
              Đăng ký
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </div>

          <RegistrationFormDialog open={regOpen} onOpenChange={setRegOpen} />

          <p className="text-center text-xs text-muted-foreground">
            {t("login.footer")} © {new Date().getFullYear()}
          </p>
        </motion.div>
      </div>

      {/* Right side - Image Cover */}
      <div className="hidden lg:block lg:w-1/2 relative overflow-hidden bg-zinc-900">
        <div className="absolute inset-0 bg-primary/20 mix-blend-multiply z-10" />
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-900/80 via-transparent to-transparent z-10" />
        <img
          src="https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=1920&h=1080&fit=crop"
          alt="Dashboard Cover"
          className="absolute inset-0 w-full h-full object-cover object-center opacity-80"
        />
        <div className="absolute bottom-16 left-16 right-16 z-20">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="glass-panel p-8 rounded-3xl"
          >
            <h2 className="text-2xl font-bold text-white mb-2 font-display">{t("login.cover.title")}</h2>
            <p className="text-white/80 leading-relaxed">
              {t("login.cover.desc")}
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
