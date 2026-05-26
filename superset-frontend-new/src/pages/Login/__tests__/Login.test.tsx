import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Login from "@/pages/Login";
import { useAuthStore } from "@/store/authStore";
import { test, expect, vi, beforeEach } from "vitest";

vi.mock("@/store/authStore", () => ({
  useAuthStore: vi.fn(),
}));

const mockLogin = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useAuthStore).mockImplementation((selector?: any) => {
    const state = { login: mockLogin };
    return selector ? selector(state) : state;
  });
  window.location.href = "";
});

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>,
  );
}

test("renders login form", () => {
  renderLogin();
  expect(screen.getByText("starfly")).toBeInTheDocument();
  expect(screen.getByText("登录以继续")).toBeInTheDocument();
  expect(screen.getByLabelText("用户名")).toBeInTheDocument();
  expect(screen.getByLabelText("密码")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
});

test("shows error on failed login", async () => {
  mockLogin.mockRejectedValue(new Error("Invalid credentials"));
  renderLogin();

  await userEvent.type(screen.getByLabelText("用户名"), "admin");
  await userEvent.type(screen.getByLabelText("密码"), "wrong");
  await userEvent.click(screen.getByRole("button", { name: "登录" }));

  expect(await screen.findByText("Invalid credentials")).toBeInTheDocument();
});

test("navigates to home on successful login", async () => {
  mockLogin.mockResolvedValue(undefined);
  renderLogin();

  await userEvent.type(screen.getByLabelText("用户名"), "admin");
  await userEvent.type(screen.getByLabelText("密码"), "pass");
  await userEvent.click(screen.getByRole("button", { name: "登录" }));

  await screen.findByText("登录");
  expect(window.location.href).toBe("http://localhost:3000/");
});

test("renders with username autoFocus", () => {
  renderLogin();
  const usernameInput = screen.getByLabelText("用户名");
  expect(document.activeElement).toBe(usernameInput);
});
