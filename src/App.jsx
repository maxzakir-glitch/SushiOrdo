import { HashRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import Admin from './pages/Admin';
import TvPlayer from './pages/TvPlayer';
function Home() {
  return <main className="min-h-screen bg-zinc-950 text-white grid place-items-center p-6"><div className="max-w-2xl rounded-3xl border border-zinc-800 bg-zinc-900 p-8 space-y-5">
    <h1 className="text-3xl font-bold">Суши ORDO · версия 2</h1>
    <p className="text-zinc-300">Отдельное меню для шести телевизоров. Введите свои блюда и фотографии в админке. Демонстрационного меню другого кафе здесь нет.</p>
    <Link className="inline-block bg-white text-black px-5 py-3 rounded-xl font-bold" to="/admin">Открыть админку</Link>
    <div className="grid grid-cols-3 gap-3">{Array.from({ length: 6 }, (_, i) => <Link className="border border-zinc-700 rounded-xl p-4 text-center" key={i} to={'/tv/tv' + (i + 1)}>Телевизор {i + 1}</Link>)}</div>
    <p className="text-sm text-zinc-400">У каждого ТВ своя ссылка. Публикация меню требует GitHub-токен только в админке, не на телевизорах. Не закрывайте редактор до подтверждения сохранения.</p>
  </div></main>;
}
export default function App() { return <HashRouter><Routes><Route path="/" element={<Home />} /><Route path="/admin" element={<Admin />} /><Route path="/tv/:id" element={<TvPlayer />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></HashRouter>; }
