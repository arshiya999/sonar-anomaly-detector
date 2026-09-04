import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import DashboardPage from "@/pages/Dashboard";
import LivePage from "@/pages/Live";
import UploadPage from "@/pages/Upload";
import AnalysisPage from "@/pages/Analysis";
import DetectionsPage from "@/pages/Detections";
import MapPage from "@/pages/MapPage";
import ReportsPage from "@/pages/Reports";
import HistoryPage from "@/pages/History";
import SettingsPage from "@/pages/Settings";
import AboutPage from "@/pages/About";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="live" element={<LivePage />} />
          <Route path="upload" element={<UploadPage />} />
          <Route path="analysis" element={<AnalysisPage />} />
          <Route path="detections" element={<DetectionsPage />} />
          <Route path="map" element={<MapPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="about" element={<AboutPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
