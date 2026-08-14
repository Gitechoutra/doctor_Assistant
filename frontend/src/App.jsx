import AppRouter from "./router/AppRouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { AuthProvider } from "./context/AuthContext";

// The boundary sits above AuthProvider on purpose: the provider reads
// localStorage while it renders, so a crash there has to be caught by
// something outside it or the screen simply goes blank.
function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
