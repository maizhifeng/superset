import { test, expect } from "vitest";
import { render } from "@testing-library/react";
import ListPageLayout from "@/components/ListPageLayout";

test("shows skeleton when loading and no data", () => {
  const { container } = render(
    <ListPageLayout
      loading
      error={null}
      hasData={false}
      emptyState={<div>Empty</div>}
    >
      <div>Content</div>
    </ListPageLayout>,
  );
  expect(container.textContent).not.toContain("Content");
  expect(container.textContent).not.toContain("Empty");
});

test("shows error alert when error and no data", () => {
  const { getByText } = render(
    <ListPageLayout
      loading={false}
      error="Something went wrong"
      hasData={false}
      emptyState={<div>Empty</div>}
    >
      <div>Content</div>
    </ListPageLayout>,
  );
  expect(getByText("Something went wrong")).toBeTruthy();
});

test("shows empty state when no data and not loading", () => {
  const { getByText } = render(
    <ListPageLayout
      loading={false}
      error={null}
      hasData={false}
      emptyState={<div>No items found</div>}
    >
      <div>Content</div>
    </ListPageLayout>,
  );
  expect(getByText("No items found")).toBeTruthy();
});

test("shows children when hasData is true", () => {
  const { getByText } = render(
    <ListPageLayout
      loading={false}
      error={null}
      hasData
      emptyState={<div>Empty</div>}
    >
      <div>Content</div>
    </ListPageLayout>,
  );
  expect(getByText("Content")).toBeTruthy();
});

test("shows custom skeleton when provided", () => {
  const { getByText } = render(
    <ListPageLayout
      loading
      error={null}
      hasData={false}
      skeleton={<div>Custom loader</div>}
      emptyState={<div>Empty</div>}
    >
      <div>Content</div>
    </ListPageLayout>,
  );
  expect(getByText("Custom loader")).toBeTruthy();
});
