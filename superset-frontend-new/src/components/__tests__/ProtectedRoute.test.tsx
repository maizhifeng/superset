import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuthStore } from "@/store/authStore";
import { test, expect, beforeEach } from "vitest";

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

beforeEach(() => {
  useAuthStore.setState({
    token: null,
    user: null,
    loading: false,
    isAuthenticated: false,
  });
});

test("shows loading spinner when auth is loading", () => {
  useAuthStore.setState({ loading: true });
  renderWithRouter(
    <ProtectedRoute>
      <div>Protected Content</div>
    </ProtectedRoute>,
  );
  expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
});

test("redirects to login when not authenticated", () => {
  renderWithRouter(
    <ProtectedRoute>
      <div>Protected Content</div>
    </ProtectedRoute>,
  );
  expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
});

test("renders children when authenticated", () => {
  useAuthStore.setState({
    token: "valid-token",
    user: { username: "admin" },
    isAuthenticated: true,
    loading: false,
  });

  renderWithRouter(
    <ProtectedRoute>
      <div>Protected Content</div>
    </ProtectedRoute>,
  );
  expect(screen.getByText("Protected Content")).toBeInTheDocument();
});
