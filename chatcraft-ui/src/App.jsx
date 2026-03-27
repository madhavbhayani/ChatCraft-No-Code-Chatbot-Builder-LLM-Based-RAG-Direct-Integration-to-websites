import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import LandingPage from "./pages/LandingPage";
import RegisterPage from "./pages/Authentication/RegisterPage";
import LoginPage from "./pages/Authentication/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import VerifyEmailPage from "./pages/Authentication/VerifyEmailPage";
import AccountPage from "./pages/AccountPage";
import ForgotPasswordPage from "./pages/Authentication/ForgotPasswordPage";
import ResetPasswordPage from "./pages/Authentication/ResetPasswordPage";
import DocsPage from "./pages/DocsPage";
import IntegratePage from "./pages/Console/IntegratePage";
import ConsolePage from "./pages/Console/ConsolePage";
import ConsoleRedirect from "./pages/Console/ConsoleRedirect";

function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "#FFF8F8",
            border: "1px solid #FFE4E6",
            color: "#0C0A0A",
          },
        }}
      />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/docs" element={<DocsPage />} />
        <Route path="/console" element={<ConsoleRedirect />} />
        <Route path="/console/:projectId/*" element={<ConsolePage />} />
        <Route path="/console/integrate/:projectId" element={<IntegratePage />} />
        <Route path="/console/integrate/:projectId/:stepSlug" element={<IntegratePage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
