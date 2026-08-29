import React, { useState } from 'react';
import { Plus, Eye, MessageSquare, Heart, Share2, FileText, Calendar, Pin, MoreHorizontal } from 'lucide-react';

export default function CardGrid() {
  const [activeFilter, setActiveFilter] = useState('All');

  const stats = [
    { label: 'Bài viết / Posts', value: '48', icon: FileText, color: 'text-[#2563eb]', bg: 'bg-blue-50' },
    { label: 'Lượt xem / Views', value: '1.2k', icon: Eye, color: 'text-[#0d9488]', bg: 'bg-teal-50' },
    { label: 'Bình luận / Comments', value: '89', icon: MessageSquare, color: 'text-[#7c3aed]', bg: 'bg-violet-50' },
  ];

  const filters = [
    { id: 'All', label: 'Tất cả / All', activeColor: 'bg-slate-800 text-white' },
    { id: 'Thông báo', label: 'Thông báo / Announcements', activeColor: 'bg-[#f97316] text-white', dotColor: 'bg-[#f97316]' },
    { id: 'Sự kiện', label: 'Sự kiện / Events', activeColor: 'bg-[#0d9488] text-white', dotColor: 'bg-[#0d9488]' },
    { id: 'Hoạt động', label: 'Hoạt động / Activities', activeColor: 'bg-[#2563eb] text-white', dotColor: 'bg-[#2563eb]' },
    { id: 'Học thuật', label: 'Học thuật / Academic', activeColor: 'bg-[#7c3aed] text-white', dotColor: 'bg-[#7c3aed]' },
  ];

  const getCategoryStyles = (category: string) => {
    switch (category) {
      case 'Thông báo': return 'text-[#f97316] bg-orange-50 border border-orange-200';
      case 'Sự kiện': return 'text-[#0d9488] bg-teal-50 border border-teal-200';
      case 'Hoạt động': return 'text-[#2563eb] bg-blue-50 border border-blue-200';
      case 'Học thuật': return 'text-[#7c3aed] bg-violet-50 border border-violet-200';
      default: return 'text-gray-600 bg-gray-100 border-gray-200';
    }
  };

  const getAvatarColor = (initials: string) => {
    const colors = [
      'bg-red-100 text-red-600',
      'bg-green-100 text-green-600',
      'bg-blue-100 text-blue-600',
      'bg-yellow-100 text-yellow-600',
      'bg-purple-100 text-purple-600',
      'bg-pink-100 text-pink-600',
    ];
    let sum = 0;
    for (let i = 0; i < initials.length; i++) {
      sum += initials.charCodeAt(i);
    }
    return colors[sum % colors.length];
  };

  const pinnedPost = {
    title: 'Lễ Vinh Danh Học Viên Xuất Sắc Quý 3 / Q3 Outstanding Student Awards',
    excerpt: 'Cùng nhìn lại những khoảnh khắc đáng nhớ và tôn vinh những cá nhân xuất sắc nhất trong quý vừa qua tại trung tâm. / A look back at memorable moments honoring the best individuals of the past quarter.',
    category: 'Sự kiện',
    author: 'Admin',
    authorInitials: 'AD',
    date: '12 Thg 10, 2024 / Oct 12, 2024',
    image: '/__mockup/images/edu-seminar.jpg',
    likes: 245,
    comments: 42,
    views: 890,
  };

  const posts = [
    {
      id: 1,
      title: 'Thông báo nghỉ lễ Quốc Khánh 2/9 / National Day Holiday Notice',
      excerpt: 'Trung tâm sẽ nghỉ làm việc từ ngày 01/09 đến hết ngày 04/09. Chúc mọi người kỳ nghỉ lễ vui vẻ! / We will be closed from Sep 1 to Sep 4.',
      category: 'Thông báo',
      author: 'Nguyễn Văn A',
      authorInitials: 'NA',
      date: '28 Thg 08, 2024 / Aug 28, 2024',
      image: '/__mockup/images/holiday-notice.jpg',
      likes: 120,
      comments: 5,
      views: 450,
    },
    {
      id: 2,
      title: 'Chương trình Học bổng Tài năng trẻ / Young Talent Scholarship Program',
      excerpt: 'Cơ hội nhận học bổng toàn phần cho các học viên đạt giải thưởng quốc gia. / Full scholarship opportunities for students with national awards.',
      category: 'Học thuật',
      author: 'Trần Thị B',
      authorInitials: 'TB',
      date: '15 Thg 08, 2024 / Aug 15, 2024',
      image: '/__mockup/images/scholarship.jpg',
      likes: 310,
      comments: 56,
      views: 1200,
    },
    {
      id: 3,
      title: 'Chung kết Cuộc thi Hùng biện Tiếng Anh / English Speaking Contest Finale',
      excerpt: 'Tham gia cổ vũ cho top 10 thí sinh xuất sắc nhất vòng chung kết diễn ra vào cuối tuần này. / Join us in cheering for the top 10 finalists this weekend.',
      category: 'Sự kiện',
      author: 'Admin',
      authorInitials: 'AD',
      date: '10 Thg 08, 2024 / Aug 10, 2024',
      image: '/__mockup/images/english-contest.jpg',
      likes: 185,
      comments: 24,
      views: 630,
    },
    {
      id: 4,
      title: 'Khởi động Trại hè Khám phá 2024 / Launching Summer Discovery Camp 2024',
      excerpt: 'Sẵn sàng cho một mùa hè đầy năng lượng với hàng loạt hoạt động ngoài trời lý thú. / Get ready for an energetic summer with outdoor activities.',
      category: 'Hoạt động',
      author: 'Lê Hoàng C',
      authorInitials: 'LC',
      date: '01 Thg 06, 2024 / Jun 01, 2024',
      image: '/__mockup/images/summer-camp.jpg',
      likes: 540,
      comments: 82,
      views: 2100,
    },
    {
      id: 5,
      title: 'Khai giảng Khóa Kỹ năng mềm chuyên sâu / Intensive Soft Skills Course Opening',
      excerpt: 'Phát triển kỹ năng giao tiếp, làm việc nhóm và thuyết trình ấn tượng. / Develop communication, teamwork, and presentation skills.',
      category: 'Học thuật',
      author: 'Phạm D',
      authorInitials: 'PD',
      date: '20 Thg 05, 2024 / May 20, 2024',
      image: '/__mockup/images/soft-skills.jpg',
      likes: 95,
      comments: 12,
      views: 340,
    },
  ];

  const filteredPosts = activeFilter === 'All' ? posts : posts.filter(post => post.category === activeFilter);

  return (
    <div className="min-h-screen bg-[#f8f9fb] p-4 md:p-8 font-sans text-slate-800">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* HEADER SECTION */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 mb-2">Bảng tin / News Feed</h1>
            <p className="text-slate-500 text-sm max-w-xl">
              Cập nhật những thông báo, sự kiện và hoạt động mới nhất từ trung tâm. 
              <br className="hidden sm:block"/>
              Stay updated with the latest announcements, events, and activities.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
            <div className="flex gap-3 w-full sm:w-auto">
              {stats.map((stat, idx) => (
                <div key={idx} className="flex flex-col items-center justify-center p-3 px-4 bg-[#f8f9fb] rounded-xl border border-slate-100 min-w-[100px]">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full ${stat.bg} ${stat.color} mb-1`}>
                    <stat.icon className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider text-center line-clamp-1">{stat.label.split(' / ')[0]}</span>
                  <span className="text-lg font-bold text-slate-800 leading-none mt-1">{stat.value}</span>
                </div>
              ))}
            </div>
            
            <button className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-[#f97316] to-[#fb923c] text-white px-6 py-4 rounded-xl font-bold shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50 hover:-translate-y-0.5 transition-all duration-200">
              <Plus className="w-5 h-5" />
              <span className="text-left leading-tight">
                Đăng bài mới
                <span className="block text-[10px] font-medium opacity-90 font-normal">New Post</span>
              </span>
            </button>
          </div>
        </header>

        {/* FILTER BAR */}
        <div className="flex flex-nowrap overflow-x-auto pb-2 gap-3 scrollbar-hide">
          {filters.map((filter) => {
            const isActive = activeFilter === filter.id;
            return (
              <button
                key={filter.id}
                onClick={() => setActiveFilter(filter.id)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all duration-200 border ${
                  isActive 
                    ? `${filter.activeColor} shadow-md border-transparent` 
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {filter.dotColor && (
                  <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-white' : filter.dotColor}`}></span>
                )}
                {filter.label}
              </button>
            );
          })}
        </div>

        {/* PINNED POST (Only show if 'All' or matches category) */}
        {(activeFilter === 'All' || activeFilter === pinnedPost.category) && (
          <div className="group bg-white rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300 flex flex-col lg:flex-row relative cursor-pointer">
            <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm font-bold text-slate-800 shadow-sm">
              <Pin className="w-4 h-4 text-red-500 fill-red-500" />
              Ghim / Pinned
            </div>
            
            <div className="lg:w-7/12 relative aspect-video lg:aspect-[4/3] xl:aspect-[16/9] overflow-hidden bg-gradient-to-br from-indigo-100 to-purple-100">
              <img 
                src={pinnedPost.image} 
                alt="Pinned Post" 
                className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-in-out"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22800%22%20height%3D%22400%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%23e2e8f0%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20fill%3D%22%2394a3b8%22%20font-family%3D%22sans-serif%22%20font-size%3D%2224%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%3EImage%20Placeholder%3C%2Ftext%3E%3C%2Fsvg%3E';
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent lg:hidden"></div>
            </div>
            
            <div className="lg:w-5/12 p-6 lg:p-10 flex flex-col justify-center">
              <div className="flex items-center gap-3 mb-4">
                <span className={`px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${getCategoryStyles(pinnedPost.category)}`}>
                  {pinnedPost.category}
                </span>
                <span className="text-sm font-medium text-slate-500 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  {pinnedPost.date.split(' / ')[0]}
                </span>
              </div>
              
              <h2 className="text-2xl lg:text-3xl font-extrabold text-slate-900 leading-tight mb-4 group-hover:text-[#2563eb] transition-colors">
                {pinnedPost.title.split(' / ')[0]}
                <span className="block text-xl lg:text-xl font-bold text-slate-500 mt-1">
                  {pinnedPost.title.split(' / ')[1]}
                </span>
              </h2>
              
              <p className="text-slate-600 mb-8 line-clamp-3 lg:line-clamp-none text-base lg:text-lg">
                {pinnedPost.excerpt.split(' / ')[0]}
                <br className="hidden lg:block"/>
                <span className="text-slate-400 text-sm mt-1 lg:mt-2 block">{pinnedPost.excerpt.split(' / ')[1]}</span>
              </p>
              
              <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-6">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${getAvatarColor(pinnedPost.authorInitials)}`}>
                    {pinnedPost.authorInitials}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{pinnedPost.author}</p>
                    <p className="text-xs text-slate-500">Người đăng / Author</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-4 text-slate-500 text-sm font-medium">
                  <span className="flex items-center gap-1.5 hover:text-[#0d9488] transition-colors"><Eye className="w-4 h-4" /> {pinnedPost.views}</span>
                  <span className="flex items-center gap-1.5 hover:text-red-500 transition-colors"><Heart className="w-4 h-4" /> {pinnedPost.likes}</span>
                  <span className="flex items-center gap-1.5 hover:text-[#2563eb] transition-colors"><MessageSquare className="w-4 h-4" /> {pinnedPost.comments}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* GRID OF POSTS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPosts.map((post) => (
            <div key={post.id} className="group cursor-pointer bg-white rounded-2xl overflow-hidden shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 hover:shadow-[0_12px_30px_-4px_rgba(0,0,0,0.1)] hover:-translate-y-1 transition-all duration-300 flex flex-col">
              <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
                <img 
                  src={post.image} 
                  alt={post.title} 
                  className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22400%22%20height%3D%22300%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%23f1f5f9%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20fill%3D%22%2394a3b8%22%20font-family%3D%22sans-serif%22%20font-size%3D%2216%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%3EImage%3C%2Ftext%3E%3C%2Fsvg%3E';
                  }}
                />
                <div className="absolute top-4 left-4">
                  <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider shadow-sm backdrop-blur-md bg-white/95 ${getCategoryStyles(post.category)}`}>
                    {post.category}
                  </span>
                </div>
              </div>
              
              <div className="p-5 flex flex-col flex-1">
                <div className="text-xs font-medium text-slate-400 mb-3 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  {post.date.split(' / ')[0]}
                </div>
                
                <h3 className="text-lg font-bold text-slate-900 leading-snug mb-1 group-hover:text-[#2563eb] transition-colors line-clamp-2">
                  {post.title.split(' / ')[0]}
                </h3>
                <h4 className="text-sm font-semibold text-slate-500 mb-3 line-clamp-1">
                  {post.title.split(' / ')[1]}
                </h4>
                
                <p className="text-slate-600 text-sm mb-6 line-clamp-2">
                  {post.excerpt.split(' / ')[0]}
                </p>
                
                <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${getAvatarColor(post.authorInitials)}`}>
                      {post.authorInitials}
                    </div>
                    <span className="text-xs font-bold text-slate-700">{post.author}</span>
                  </div>
                  
                  <div className="flex items-center gap-3 text-slate-400 text-xs font-medium">
                    <span className="flex items-center gap-1 hover:text-slate-700 transition-colors"><Eye className="w-3.5 h-3.5" /> {post.views}</span>
                    <span className="flex items-center gap-1 hover:text-slate-700 transition-colors"><MessageSquare className="w-3.5 h-3.5" /> {post.comments}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* EMPTY STATE */}
        {filteredPosts.length === 0 && activeFilter !== 'All' && activeFilter !== pinnedPost.category && (
          <div className="py-20 text-center bg-white rounded-2xl border border-slate-100 shadow-sm mt-6">
            <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-1">Không có bài viết nào / No posts found</h3>
            <p className="text-slate-500 text-sm">Chưa có bài viết nào trong danh mục này. / There are no posts in this category yet.</p>
          </div>
        )}

      </div>
    </div>
  );
}