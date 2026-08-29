import React from "react";
import { 
  Bell, 
  Search, 
  PenSquare, 
  ChevronRight, 
  Clock, 
  MessageSquare, 
  Eye, 
  BarChart2, 
  Award,
  Users,
  FileText
} from "lucide-react";

export function Magazine() {
  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap');`}} />
      <div className="min-h-screen bg-[#fffcf9] text-[#1e293b] font-sans selection:bg-[#dc2626] selection:text-white">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 bg-[#fffcf9]/90 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <div className="w-8 h-8 bg-[#1e293b] rounded-sm flex items-center justify-center text-white">
                E
              </div>
              <span>EduManage</span>
            </div>
            
            <nav className="hidden md:flex items-center gap-2 text-sm text-slate-500 font-medium">
              <span className="hover:text-slate-900 cursor-pointer transition-colors">Home</span>
              <ChevronRight className="w-4 h-4" />
              <span className="text-slate-900">Bảng tin / News Feed</span>
            </nav>
          </div>

          <div className="flex items-center gap-6">
            <button className="text-slate-400 hover:text-slate-900 transition-colors">
              <Search className="w-5 h-5" />
            </button>
            <button className="text-slate-400 hover:text-slate-900 transition-colors relative">
              <Bell className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#dc2626] rounded-full"></span>
            </button>
            <div className="w-px h-6 bg-slate-200"></div>
            <button className="flex items-center gap-2 bg-[#1e293b] hover:bg-slate-800 text-white px-5 py-2.5 rounded-full text-sm font-medium transition-all shadow-sm">
              <PenSquare className="w-4 h-4" />
              <span>Đăng bài / Post</span>
            </button>
            <div className="w-9 h-9 rounded-full bg-slate-200 border border-slate-300 overflow-hidden cursor-pointer">
              <img src={`https://ui-avatars.com/api/?name=Admin&background=f1f5f9&color=1e293b`} alt="User avatar" className="w-full h-full object-cover" />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-10">
        {/* Categories / Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-['Playfair_Display'] font-bold text-[#1e293b] mb-3">
              Tiêu Điểm<span className="text-[#dc2626]">.</span>
            </h1>
            <p className="text-slate-500 text-lg max-w-2xl">
              Cập nhật những tin tức, sự kiện và hoạt động nổi bật nhất từ EduManage / <br className="hidden md:block"/>
              Catch up on the latest news, events, and activities.
            </p>
          </div>
          
          <div className="flex items-center gap-8 overflow-x-auto pb-2 border-b border-slate-200 text-sm font-medium w-full md:w-auto">
            <button className="text-[#1e293b] border-b-2 border-[#dc2626] pb-3 whitespace-nowrap">
              Tất cả / All
            </button>
            <button className="text-slate-500 hover:text-[#1e293b] pb-3 border-b-2 border-transparent hover:border-slate-300 transition-colors whitespace-nowrap">
              Thông báo / Announcements
            </button>
            <button className="text-slate-500 hover:text-[#1e293b] pb-3 border-b-2 border-transparent hover:border-slate-300 transition-colors whitespace-nowrap">
              Sự kiện / Events
            </button>
            <button className="text-slate-500 hover:text-[#1e293b] pb-3 border-b-2 border-transparent hover:border-slate-300 transition-colors whitespace-nowrap">
              Hoạt động / Activities
            </button>
            <button className="text-slate-500 hover:text-[#1e293b] pb-3 border-b-2 border-transparent hover:border-slate-300 transition-colors whitespace-nowrap">
              Học thuật / Academic
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* LEFT COLUMN (65%) */}
          <div className="lg:col-span-8 flex flex-col gap-10">
            {/* Featured Article */}
            <article className="group cursor-pointer">
              <div className="relative aspect-[16/9] md:aspect-[21/9] rounded-xl overflow-hidden mb-6 bg-slate-100">
                <img 
                  src="/__mockup/images/magazine-featured.jpg" 
                  alt="Featured article" 
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#1e293b]/90 via-[#1e293b]/40 to-transparent"></div>
                
                <div className="absolute bottom-0 left-0 p-8 w-full">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="px-3 py-1 bg-[#dc2626] text-white text-xs font-bold uppercase tracking-wider rounded-sm">
                      Sự kiện / Event
                    </span>
                    <span className="text-white/80 text-sm flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" /> 2 giờ trước / 2 hours ago
                    </span>
                  </div>
                  
                  <h2 className="text-3xl md:text-4xl font-['Playfair_Display'] font-bold text-white leading-tight mb-4 group-hover:text-slate-200 transition-colors">
                    Hội thảo Giáo dục Kỷ nguyên Số: <br/> Tương lai của việc học và giảng dạy
                  </h2>
                  
                  <p className="text-slate-200 text-base md:text-lg line-clamp-2 max-w-3xl mb-6 font-light">
                    Sự kiện thu hút hơn 500 chuyên gia giáo dục thảo luận về việc tích hợp AI và các công cụ công nghệ mới vào chương trình giảng dạy, mang lại trải nghiệm cá nhân hóa cho học viên.
                  </p>
                  
                  <div className="flex items-center gap-4 text-white">
                    <div className="flex items-center gap-2">
                      <img src="https://ui-avatars.com/api/?name=Dr+Tran&background=1e293b&color=fff" className="w-8 h-8 rounded-full border border-white/20" alt="Author" />
                      <span className="text-sm font-medium">Dr. Trần Minh</span>
                    </div>
                    <div className="w-1 h-1 bg-white/40 rounded-full"></div>
                    <span className="text-sm text-white/80">Đọc 5 phút / 5 min read</span>
                  </div>
                </div>
              </div>
            </article>

            {/* Medium Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Card 1 */}
              <article className="group cursor-pointer">
                <div className="aspect-[4/3] rounded-xl overflow-hidden mb-5 bg-slate-100">
                  <img 
                    src="/__mockup/images/magazine-medium-1.jpg" 
                    alt="Article 1" 
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                </div>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-[#dc2626] text-xs font-bold uppercase tracking-wider">
                    Học thuật / Academic
                  </span>
                  <span className="text-slate-400 text-xs flex items-center gap-1.5">
                    12/10/2023
                  </span>
                </div>
                <h3 className="text-xl font-['Playfair_Display'] font-bold text-[#1e293b] leading-snug mb-3 group-hover:text-[#dc2626] transition-colors">
                  Cuộc thi Sáng tạo Robot Toàn Trung Tâm 2023
                </h3>
                <p className="text-slate-600 text-sm line-clamp-2 mb-4 leading-relaxed">
                  Các đội thi đã thể hiện tài năng lập trình và lắp ráp xuất sắc qua những mô hình robot giải quyết các vấn đề thực tiễn về môi trường.
                </p>
                <div className="flex items-center justify-between mt-auto">
                  <span className="text-xs font-medium text-slate-500">Bởi Nguyễn Hải</span>
                  <div className="flex items-center gap-3 text-slate-400 text-xs">
                    <span className="flex items-center gap-1"><Eye className="w-3 h-3"/> 1.2k</span>
                    <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3"/> 45</span>
                  </div>
                </div>
              </article>

              {/* Card 2 */}
              <article className="group cursor-pointer">
                <div className="aspect-[4/3] rounded-xl overflow-hidden mb-5 bg-slate-100">
                  <img 
                    src="/__mockup/images/magazine-medium-2.jpg" 
                    alt="Article 2" 
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                </div>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-[#dc2626] text-xs font-bold uppercase tracking-wider">
                    Hoạt động / Activity
                  </span>
                  <span className="text-slate-400 text-xs flex items-center gap-1.5">
                    10/10/2023
                  </span>
                </div>
                <h3 className="text-xl font-['Playfair_Display'] font-bold text-[#1e293b] leading-snug mb-3 group-hover:text-[#dc2626] transition-colors">
                  Câu Lạc Bộ Tiếng Anh: Kỹ năng thuyết trình trước đám đông
                </h3>
                <p className="text-slate-600 text-sm line-clamp-2 mb-4 leading-relaxed">
                  Buổi sinh hoạt tuần này tập trung vào việc xây dựng sự tự tin và cấu trúc bài nói hiệu quả khi đứng trước khán giả lớn.
                </p>
                <div className="flex items-center justify-between mt-auto">
                  <span className="text-xs font-medium text-slate-500">Bởi Lê Vy</span>
                  <div className="flex items-center gap-3 text-slate-400 text-xs">
                    <span className="flex items-center gap-1"><Eye className="w-3 h-3"/> 890</span>
                    <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3"/> 24</span>
                  </div>
                </div>
              </article>
            </div>
          </div>

          {/* RIGHT COLUMN (35%) */}
          <div className="lg:col-span-4 flex flex-col gap-8">
            
            {/* Latest Posts Panel */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
              <h3 className="text-lg font-['Playfair_Display'] font-bold text-[#1e293b] border-b border-slate-100 pb-4 mb-5 flex items-center justify-between">
                <span>Bài viết mới / Latest</span>
                <button className="text-xs font-sans font-medium text-[#dc2626] hover:underline">Xem tất cả</button>
              </h3>
              
              <div className="flex flex-col gap-5">
                {/* List Item 1 */}
                <article className="group cursor-pointer flex gap-4 items-start pb-5 border-b border-slate-100 last:border-0 last:pb-0 relative before:absolute before:left-[-24px] before:top-0 before:h-full before:w-[3px] before:bg-[#dc2626] before:opacity-0 hover:before:opacity-100 before:transition-opacity">
                  <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0 bg-slate-100">
                    <img src="/__mockup/images/magazine-thumb-1.jpg" alt="Thumb" className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                  </div>
                  <div className="flex flex-col justify-between py-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[#dc2626] text-[10px] font-bold uppercase">Thông báo</span>
                      <span className="text-slate-400 text-[10px]">Hôm nay</span>
                    </div>
                    <h4 className="text-sm font-bold text-[#1e293b] leading-tight group-hover:text-[#dc2626] transition-colors line-clamp-2">
                      Lễ trao chứng chỉ quốc tế đợt 3 năm 2023
                    </h4>
                  </div>
                </article>

                {/* List Item 2 */}
                <article className="group cursor-pointer flex gap-4 items-start pb-5 border-b border-slate-100 last:border-0 last:pb-0 relative before:absolute before:left-[-24px] before:top-0 before:h-full before:w-[3px] before:bg-[#dc2626] before:opacity-0 hover:before:opacity-100 before:transition-opacity">
                  <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0 bg-slate-100">
                    <img src="/__mockup/images/magazine-thumb-2.jpg" alt="Thumb" className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                  </div>
                  <div className="flex flex-col justify-between py-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[#dc2626] text-[10px] font-bold uppercase">Hoạt động</span>
                      <span className="text-slate-400 text-[10px]">Hôm qua</span>
                    </div>
                    <h4 className="text-sm font-bold text-[#1e293b] leading-tight group-hover:text-[#dc2626] transition-colors line-clamp-2">
                      Xưởng nghệ thuật mùa thu: Khám phá tiềm năng sáng tạo
                    </h4>
                  </div>
                </article>

                {/* List Item 3 */}
                <article className="group cursor-pointer flex gap-4 items-start pb-5 border-b border-slate-100 last:border-0 last:pb-0 relative before:absolute before:left-[-24px] before:top-0 before:h-full before:w-[3px] before:bg-[#dc2626] before:opacity-0 hover:before:opacity-100 before:transition-opacity">
                  <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0 bg-slate-100">
                    <img src="/__mockup/images/magazine-thumb-3.jpg" alt="Thumb" className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                  </div>
                  <div className="flex flex-col justify-between py-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[#dc2626] text-[10px] font-bold uppercase">Sự kiện</span>
                      <span className="text-slate-400 text-[10px]">08/10</span>
                    </div>
                    <h4 className="text-sm font-bold text-[#1e293b] leading-tight group-hover:text-[#dc2626] transition-colors line-clamp-2">
                      Giải bóng rổ học sinh EduManage tranh cúp mùa đông
                    </h4>
                  </div>
                </article>

                {/* List Item 4 */}
                <article className="group cursor-pointer flex gap-4 items-start pb-5 border-b border-slate-100 last:border-0 last:pb-0 relative before:absolute before:left-[-24px] before:top-0 before:h-full before:w-[3px] before:bg-[#dc2626] before:opacity-0 hover:before:opacity-100 before:transition-opacity">
                  <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0 bg-slate-100">
                    <img src="/__mockup/images/magazine-thumb-4.jpg" alt="Thumb" className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                  </div>
                  <div className="flex flex-col justify-between py-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[#dc2626] text-[10px] font-bold uppercase">Thông báo</span>
                      <span className="text-slate-400 text-[10px]">05/10</span>
                    </div>
                    <h4 className="text-sm font-bold text-[#1e293b] leading-tight group-hover:text-[#dc2626] transition-colors line-clamp-2">
                      Lịch tập huấn nâng cao năng lực giáo viên quý 4
                    </h4>
                  </div>
                </article>
              </div>
            </div>

            {/* Stats Panel */}
            <div className="bg-[#1e293b] rounded-2xl p-6 text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
              
              <h3 className="text-lg font-['Playfair_Display'] font-bold border-b border-white/10 pb-4 mb-5">
                Thống kê / Stats
              </h3>
              
              <div className="grid grid-cols-1 gap-4">
                <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-[#dc2626]"/>
                    </div>
                    <span className="text-sm font-medium text-slate-300">Tổng bài viết</span>
                  </div>
                  <span className="text-lg font-bold">1,248</span>
                </div>
                
                <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                      <Eye className="w-4 h-4 text-[#dc2626]"/>
                    </div>
                    <span className="text-sm font-medium text-slate-300">Lượt xem tháng</span>
                  </div>
                  <span className="text-lg font-bold">45.2k</span>
                </div>
                
                <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                      <MessageSquare className="w-4 h-4 text-[#dc2626]"/>
                    </div>
                    <span className="text-sm font-medium text-slate-300">Bình luận</span>
                  </div>
                  <span className="text-lg font-bold">3,892</span>
                </div>
              </div>
            </div>

            {/* Newsletter Subscription */}
            <div className="bg-slate-100 rounded-2xl p-6 border border-slate-200 text-center">
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                <Bell className="w-5 h-5 text-[#dc2626]" />
              </div>
              <h4 className="font-['Playfair_Display'] font-bold text-[#1e293b] text-lg mb-2">
                Đăng ký nhận tin
              </h4>
              <p className="text-sm text-slate-500 mb-5">
                Nhận thông báo mới nhất về các sự kiện và bài viết nổi bật qua email của bạn.
              </p>
              <div className="flex gap-2">
                <input 
                  type="email" 
                  placeholder="Email của bạn..." 
                  className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e293b]/20"
                />
                <button className="bg-[#1e293b] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors">
                  Gửi
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* Load More Section */}
        <div className="mt-16 text-center">
          <button className="inline-flex items-center justify-center gap-2 px-8 py-3.5 border border-slate-300 rounded-full text-slate-600 hover:text-[#1e293b] hover:border-[#1e293b] transition-all font-medium bg-white hover:bg-slate-50 shadow-sm">
            Xem thêm bài viết / Load more posts
          </button>
        </div>
      </main>
    </div>
    </>
  );
}
