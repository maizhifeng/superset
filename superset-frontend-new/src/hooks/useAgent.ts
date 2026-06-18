import { useState, useRef, useCallback } from "react";
import type { AgentStep } from "@/components/AgentApp/types";

function generateStepId(): string {
  return `step_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

interface UseAgentReturn {
  steps: AgentStep[];
  isRunning: boolean;
  finalResult: string;
  execute: (text: string, sessionId: string) => Promise<void>;
  stop: () => void;
  clear: () => void;
}

export function useAgent(): UseAgentReturn {
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [finalResult, setFinalResult] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setIsRunning(false);
  }, []);

  const clear = useCallback(() => {
    setSteps([]);
    setFinalResult("");
  }, []);

  const execute = useCallback(async (text: string, sessionId: string) => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    setIsRunning(true);
    setSteps([]);
    setFinalResult("");

    const { useAgentStore } = await import("@/store/agentStore");

    const analyzeStep: AgentStep = {
      id: generateStepId(),
      type: "analyze",
      status: "running",
      description: "正在分析你的问题…",
      timestamp: Date.now(),
    };
    setSteps([analyzeStep]);
    useAgentStore.getState().addStep(sessionId, analyzeStep);

    try {
      const { streamWithTools } = await import("@/api/aiInsight");
      const { getActivePreset } = await import("@/config/aiConfig");
      const preset = getActivePreset();

      const systemPrompt = `你是一个专业的数据分析助手。你的任务是根据用户的问题，使用 query_superset 工具查询数据并进行分析。

## 工具
- query_superset: 查询数据集，支持 columns（分组维度）、metrics（聚合指标）、time_range（时间范围）

## 规则
1. 始终使用 query_superset 工具获取数据，不要凭空编造数据
2. 分析基于实际查询结果
3. 输出使用中文
4. 先展示数据表格，再给出分析结论
5. 不要输出思考过程`;

      let result = "";

      const { addStep, updateStep } = useAgentStore.getState();

      await streamWithTools(
        systemPrompt,
        text,
        {
          onText: (token) => {
            result += token;
          },
          onStatus: (status) => {
            if (status.includes("查询")) {
              const queryStep: AgentStep = {
                id: generateStepId(),
                type: "query",
                status: "running",
                description: status,
                timestamp: Date.now(),
              };
              setSteps((prev) => [...prev, queryStep]);
              addStep(sessionId, queryStep);
            } else if (status.includes("分析")) {
              const analyzeStep2: AgentStep = {
                id: generateStepId(),
                type: "analyze",
                status: "running",
                description: status,
                timestamp: Date.now(),
              };
              setSteps((prev) => [...prev, analyzeStep2]);
              addStep(sessionId, analyzeStep2);
            }
          },
          onError: (error) => {
            const errStep: AgentStep = {
              id: generateStepId(),
              type: "analyze",
              status: "error",
              description: `执行失败: ${error}`,
              timestamp: Date.now(),
            };
            setSteps((prev) => [...prev, errStep]);
            updateStep(sessionId, errStep.id, errStep);
          },
          onDone: () => {
            setSteps((prev) =>
              prev.map((s) =>
                s.status === "running"
                  ? {
                      ...s,
                      status: "done" as const,
                      duration: Date.now() - s.timestamp,
                    }
                  : s,
              ),
            );
            setFinalResult(result);
            setIsRunning(false);
          },
        },
        abort.signal,
        {
          provider: preset.provider,
          model: preset.model,
          baseUrl: preset.baseUrl,
        },
      );

      setFinalResult(result);
    } catch (e: unknown) {
      if ((e as Error).name === "AbortError") {
        setIsRunning(false);
        return;
      }
      setSteps((prev) =>
        prev.map((s) =>
          s.status === "running"
            ? {
                ...s,
                status: "error" as const,
                duration: Date.now() - s.timestamp,
              }
            : s,
        ),
      );
      setFinalResult(`执行出错: ${(e as Error).message}`);
    } finally {
      setIsRunning(false);
    }
  }, []);

  return { steps, isRunning, finalResult, execute, stop, clear };
}
