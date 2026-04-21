import { useState } from "react";
import { useLogin, useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GraduationCap, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

export function Login() {
  const { data: user, isLoading: isAuthLoading } = useAuth();
  const login = useLogin();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  if (isAuthLoading) return null;
  if (user) return <Redirect to="/" />;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate({ username, password });
  };

  return (
    <div className="min-h-screen w-full flex">
      {/* Left side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12 lg:p-24 bg-background relative z-10">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="w-full max-w-md space-y-8"
        >
          <div className="flex flex-col items-center lg:items-start text-center lg:text-left space-y-2">
            <div className="bg-primary/10 p-3 rounded-2xl text-primary inline-flex mb-4">
              <GraduationCap className="h-8 w-8" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold font-display tracking-tight text-foreground">
              Chào mừng trở lại
            </h1>
            <p className="text-muted-foreground text-base">
              Đăng nhập vào hệ thống quản lý giáo dục EduManage
            </p>
          </div>

          <div className="bg-card p-8 rounded-3xl border border-border shadow-2xl shadow-black/5 mt-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-sm font-semibold text-foreground">Tài khoản</Label>
                <Input 
                  id="username"
                  type="text" 
                  placeholder="admin"
                  required 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="h-12 px-4 rounded-xl bg-background border-border focus-visible:ring-primary/20 transition-all"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-semibold text-foreground">Mật khẩu</Label>
                  <a href="#" className="text-xs font-medium text-primary hover:text-primary/80 transition-colors">
                    Quên mật khẩu?
                  </a>
                </div>
                <Input 
                  id="password"
                  type="password" 
                  placeholder="••••••••"
                  required 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 px-4 rounded-xl bg-background border-border focus-visible:ring-primary/20 transition-all"
                />
              </div>
              <Button 
                type="submit" 
                disabled={login.isPending}
                className="w-full h-12 rounded-xl font-bold text-base bg-gradient-to-r from-primary to-primary/90 hover:shadow-lg hover:shadow-primary/30 transition-all duration-300"
              >
                {login.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "Đăng nhập"}
              </Button>
            </form>
          </div>
          
          <p className="text-center text-sm text-muted-foreground mt-8">
            Hệ thống quản lý giáo dục © {new Date().getFullYear()}
          </p>
        </motion.div>
      </div>

      {/* Right side - Image Cover */}
      <div className="hidden lg:block lg:w-1/2 relative overflow-hidden bg-zinc-900">
        <div className="absolute inset-0 bg-primary/20 mix-blend-multiply z-10" />
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-900/80 via-transparent to-transparent z-10" />
        {/* landing page hero modern abstract architecture */}
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
            <h2 className="text-2xl font-bold text-white mb-2 font-display">Tối ưu hoá vận hành</h2>
            <p className="text-white/80 leading-relaxed">
              Giải pháp toàn diện giúp quản lý trung tâm giáo dục, theo dõi học viên, lớp học và tài chính trong một nền tảng duy nhất, hiệu quả và thông minh.
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
