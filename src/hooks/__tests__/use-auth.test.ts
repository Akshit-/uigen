import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "@/hooks/use-auth";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/actions", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: vi.fn(),
  clearAnonWork: vi.fn(),
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: vi.fn(),
}));

vi.mock("@/actions/create-project", () => ({
  createProject: vi.fn(),
}));

import { signIn as signInAction, signUp as signUpAction } from "@/actions";
import { getAnonWorkData, clearAnonWork } from "@/lib/anon-work-tracker";
import { getProjects } from "@/actions/get-projects";
import { createProject } from "@/actions/create-project";

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    test("isLoading starts as false", () => {
      const { result } = renderHook(() => useAuth());
      expect(result.current.isLoading).toBe(false);
    });

    test("exposes signIn, signUp, and isLoading", () => {
      const { result } = renderHook(() => useAuth());
      expect(typeof result.current.signIn).toBe("function");
      expect(typeof result.current.signUp).toBe("function");
      expect(typeof result.current.isLoading).toBe("boolean");
    });
  });

  describe("signIn", () => {
    test("returns failure result without navigating when signInAction fails", async () => {
      const failResult = { success: false, error: "Invalid credentials" };
      vi.mocked(signInAction).mockResolvedValue(failResult);

      const { result } = renderHook(() => useAuth());
      let returned: any;

      await act(async () => {
        returned = await result.current.signIn("a@b.com", "wrong");
      });

      expect(returned).toEqual(failResult);
      expect(mockPush).not.toHaveBeenCalled();
    });

    test("sets isLoading to true during sign-in then resets to false", async () => {
      let resolve!: (value: any) => void;
      vi.mocked(signInAction).mockReturnValue(
        new Promise((res) => { resolve = res; })
      );

      const { result } = renderHook(() => useAuth());

      // setIsLoading(true) runs synchronously before the first await in signIn
      let signInPromise!: Promise<any>;
      act(() => { signInPromise = result.current.signIn("a@b.com", "pass"); });

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolve({ success: false, error: "err" });
        await signInPromise;
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("resets isLoading to false even when signInAction throws", async () => {
      vi.mocked(signInAction).mockRejectedValue(new Error("network error"));

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("a@b.com", "pass").catch(() => {});
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("migrates anon work and redirects to new project when anon messages exist", async () => {
      vi.mocked(signInAction).mockResolvedValue({ success: true });
      vi.mocked(getAnonWorkData).mockReturnValue({
        messages: [{ role: "user", content: "hello" }],
        fileSystemData: { "/App.jsx": { type: "file", content: "" } },
      });
      vi.mocked(createProject).mockResolvedValue({ id: "proj-anon" } as any);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("a@b.com", "pass");
      });

      expect(createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: "user", content: "hello" }],
          data: { "/App.jsx": { type: "file", content: "" } },
        })
      );
      expect(clearAnonWork).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/proj-anon");
      expect(getProjects).not.toHaveBeenCalled();
    });

    test("does not migrate anon work when messages array is empty", async () => {
      vi.mocked(signInAction).mockResolvedValue({ success: true });
      vi.mocked(getAnonWorkData).mockReturnValue({
        messages: [],
        fileSystemData: {},
      });
      vi.mocked(getProjects).mockResolvedValue([{ id: "proj-1" } as any]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("a@b.com", "pass");
      });

      expect(createProject).not.toHaveBeenCalled();
      expect(clearAnonWork).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/proj-1");
    });

    test("redirects to most recent project when no anon work exists and projects are found", async () => {
      vi.mocked(signInAction).mockResolvedValue({ success: true });
      vi.mocked(getAnonWorkData).mockReturnValue(null);
      vi.mocked(getProjects).mockResolvedValue([
        { id: "recent" } as any,
        { id: "older" } as any,
      ]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("a@b.com", "pass");
      });

      expect(mockPush).toHaveBeenCalledWith("/recent");
    });

    test("creates a new project and redirects when no anon work and no existing projects", async () => {
      vi.mocked(signInAction).mockResolvedValue({ success: true });
      vi.mocked(getAnonWorkData).mockReturnValue(null);
      vi.mocked(getProjects).mockResolvedValue([]);
      vi.mocked(createProject).mockResolvedValue({ id: "new-proj" } as any);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("a@b.com", "pass");
      });

      expect(createProject).toHaveBeenCalledWith(
        expect.objectContaining({ messages: [], data: {} })
      );
      expect(mockPush).toHaveBeenCalledWith("/new-proj");
    });

    test("passes email and password to signInAction", async () => {
      vi.mocked(signInAction).mockResolvedValue({ success: false });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@example.com", "mypassword");
      });

      expect(signInAction).toHaveBeenCalledWith("user@example.com", "mypassword");
    });

    test("returns the result from signInAction", async () => {
      const expected = { success: true };
      vi.mocked(signInAction).mockResolvedValue(expected);
      vi.mocked(getAnonWorkData).mockReturnValue(null);
      vi.mocked(getProjects).mockResolvedValue([{ id: "p" } as any]);

      const { result } = renderHook(() => useAuth());
      let returned: any;

      await act(async () => {
        returned = await result.current.signIn("a@b.com", "pass");
      });

      expect(returned).toEqual(expected);
    });
  });

  describe("signUp", () => {
    test("returns failure result without navigating when signUpAction fails", async () => {
      const failResult = { success: false, error: "Email already registered" };
      vi.mocked(signUpAction).mockResolvedValue(failResult);

      const { result } = renderHook(() => useAuth());
      let returned: any;

      await act(async () => {
        returned = await result.current.signUp("a@b.com", "pass1234");
      });

      expect(returned).toEqual(failResult);
      expect(mockPush).not.toHaveBeenCalled();
    });

    test("sets isLoading to true during sign-up then resets to false", async () => {
      let resolve!: (value: any) => void;
      vi.mocked(signUpAction).mockReturnValue(
        new Promise((res) => { resolve = res; })
      );

      const { result } = renderHook(() => useAuth());

      let signUpPromise!: Promise<any>;
      act(() => { signUpPromise = result.current.signUp("a@b.com", "pass1234"); });

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolve({ success: false, error: "err" });
        await signUpPromise;
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("resets isLoading to false even when signUpAction throws", async () => {
      vi.mocked(signUpAction).mockRejectedValue(new Error("network error"));

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("a@b.com", "pass1234").catch(() => {});
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("migrates anon work and redirects to new project when anon messages exist", async () => {
      vi.mocked(signUpAction).mockResolvedValue({ success: true });
      vi.mocked(getAnonWorkData).mockReturnValue({
        messages: [{ role: "user", content: "build me an app" }],
        fileSystemData: { "/App.tsx": { type: "file", content: "export default () => <div/>" } },
      });
      vi.mocked(createProject).mockResolvedValue({ id: "proj-new-user" } as any);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("new@user.com", "pass1234");
      });

      expect(createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: "user", content: "build me an app" }],
        })
      );
      expect(clearAnonWork).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/proj-new-user");
    });

    test("redirects to most recent project when no anon work and projects exist", async () => {
      vi.mocked(signUpAction).mockResolvedValue({ success: true });
      vi.mocked(getAnonWorkData).mockReturnValue(null);
      vi.mocked(getProjects).mockResolvedValue([{ id: "my-proj" } as any]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("a@b.com", "pass1234");
      });

      expect(mockPush).toHaveBeenCalledWith("/my-proj");
    });

    test("creates a new project when no anon work and no existing projects", async () => {
      vi.mocked(signUpAction).mockResolvedValue({ success: true });
      vi.mocked(getAnonWorkData).mockReturnValue(null);
      vi.mocked(getProjects).mockResolvedValue([]);
      vi.mocked(createProject).mockResolvedValue({ id: "brand-new" } as any);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("a@b.com", "pass1234");
      });

      expect(createProject).toHaveBeenCalledWith(
        expect.objectContaining({ messages: [], data: {} })
      );
      expect(mockPush).toHaveBeenCalledWith("/brand-new");
    });

    test("passes email and password to signUpAction", async () => {
      vi.mocked(signUpAction).mockResolvedValue({ success: false });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("signup@example.com", "securepass");
      });

      expect(signUpAction).toHaveBeenCalledWith("signup@example.com", "securepass");
    });

    test("returns the result from signUpAction", async () => {
      const expected = { success: true };
      vi.mocked(signUpAction).mockResolvedValue(expected);
      vi.mocked(getAnonWorkData).mockReturnValue(null);
      vi.mocked(getProjects).mockResolvedValue([{ id: "p" } as any]);

      const { result } = renderHook(() => useAuth());
      let returned: any;

      await act(async () => {
        returned = await result.current.signUp("a@b.com", "pass1234");
      });

      expect(returned).toEqual(expected);
    });
  });

  describe("handlePostSignIn (shared navigation logic)", () => {
    test("new project name includes a timestamp when created from anon work", async () => {
      vi.mocked(signInAction).mockResolvedValue({ success: true });
      vi.mocked(getAnonWorkData).mockReturnValue({
        messages: [{ role: "user", content: "hi" }],
        fileSystemData: {},
      });
      vi.mocked(createProject).mockResolvedValue({ id: "x" } as any);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("a@b.com", "pass");
      });

      const callArgs = vi.mocked(createProject).mock.calls[0][0];
      expect(callArgs.name).toMatch(/^Design from /);
    });

    test("new fallback project name is random and non-empty", async () => {
      vi.mocked(signInAction).mockResolvedValue({ success: true });
      vi.mocked(getAnonWorkData).mockReturnValue(null);
      vi.mocked(getProjects).mockResolvedValue([]);
      vi.mocked(createProject).mockResolvedValue({ id: "y" } as any);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("a@b.com", "pass");
      });

      const callArgs = vi.mocked(createProject).mock.calls[0][0];
      expect(callArgs.name).toMatch(/^New Design #\d+$/);
    });

    test("does not call getProjects when anon work has messages", async () => {
      vi.mocked(signInAction).mockResolvedValue({ success: true });
      vi.mocked(getAnonWorkData).mockReturnValue({
        messages: [{ role: "user", content: "hello" }],
        fileSystemData: {},
      });
      vi.mocked(createProject).mockResolvedValue({ id: "z" } as any);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("a@b.com", "pass");
      });

      expect(getProjects).not.toHaveBeenCalled();
    });
  });
});
