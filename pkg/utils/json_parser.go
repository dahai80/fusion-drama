package utils

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

// SafeParseAIJSON 安全地解析AI返回的JSON，处理常见的格式问题
// 包括：
// 1. 移除Markdown代码块标记
// 2. 提取JSON对象
// 3. 清理多余的空白和换行
// 4. 尝试修复截断的JSON
// 5. 提供详细的错误信息
func SafeParseAIJSON(aiResponse string, v interface{}) error {
	if aiResponse == "" {
		return fmt.Errorf("AI返回内容为空")
	}

	// 1. 移除可能的Markdown代码块标记
	cleaned := strings.TrimSpace(aiResponse)
	cleaned = regexp.MustCompile("(?m)^```json\\s*").ReplaceAllString(cleaned, "")
	cleaned = regexp.MustCompile("(?m)^```\\s*").ReplaceAllString(cleaned, "")
	cleaned = strings.TrimSpace(cleaned)

	// 2. 提取JSON对象 (查找第一个 { 到最后一个 })
	jsonRegex := regexp.MustCompile(`(?s)\{.*\}`)
	jsonMatch := jsonRegex.FindString(cleaned)

	if jsonMatch == "" {
		return fmt.Errorf("响应中未找到有效的JSON对象，原始响应: %s", truncateString(aiResponse, 200))
	}

	// 3. 尝试解析JSON
	err := json.Unmarshal([]byte(jsonMatch), v)
	if err == nil {
		return nil // 解析成功
	}

	// 4. 如果解析失败，尝试修复截断的JSON
	fixedJSON := attemptJSONRepair(jsonMatch)
	if fixedJSON != jsonMatch {
		if err := json.Unmarshal([]byte(fixedJSON), v); err == nil {
			return nil // 修复后解析成功
		}
	}

	// 5. 提供详细的错误上下文
	if jsonErr, ok := err.(*json.SyntaxError); ok {
		errorPos := int(jsonErr.Offset)
		start := maxInt(0, errorPos-100)
		end := minInt(len(jsonMatch), errorPos+100)

		context := jsonMatch[start:end]
		marker := strings.Repeat(" ", errorPos-start) + "^"

		return fmt.Errorf(
			"JSON解析失败: %s\n错误位置附近:\n%s\n%s",
			jsonErr.Error(),
			context,
			marker,
		)
	}

	return fmt.Errorf("JSON解析失败: %w\n原始响应: %s", err, truncateString(jsonMatch, 300))
}

// attemptJSONRepair 尝试修复常见的JSON问题
func attemptJSONRepair(jsonStr string) string {
	// 1. 处理未闭合的字符串
	// 如果最后一个字符不是 }，尝试补全
	trimmed := strings.TrimSpace(jsonStr)

	// 2. 检查是否有未闭合的引号
	if strings.Count(trimmed, `"`)%2 != 0 {
		// 有奇数个引号，尝试补全最后一个引号
		trimmed += `"`
	}

	// 3. 统计括号
	openBraces := strings.Count(trimmed, "{")
	closeBraces := strings.Count(trimmed, "}")
	openBrackets := strings.Count(trimmed, "[")
	closeBrackets := strings.Count(trimmed, "]")

	// 4. 补全未闭合的数组
	for i := 0; i < openBrackets-closeBrackets; i++ {
		trimmed += "]"
	}

	// 5. 补全未闭合的对象
	for i := 0; i < openBraces-closeBraces; i++ {
		trimmed += "}"
	}

	return trimmed
}

// ExtractJSONFromText 从文本中提取JSON对象或数组
func ExtractJSONFromText(text string) string {
	text = strings.TrimSpace(text)

	// 移除Markdown代码块
	text = regexp.MustCompile("(?m)^```json\\s*").ReplaceAllString(text, "")
	text = regexp.MustCompile("(?m)^```\\s*").ReplaceAllString(text, "")
	text = strings.TrimSpace(text)

	// 查找JSON对象
	if idx := strings.Index(text, "{"); idx != -1 {
		if lastIdx := strings.LastIndex(text, "}"); lastIdx != -1 && lastIdx > idx {
			return text[idx : lastIdx+1]
		}
	}

	// 查找JSON数组
	if idx := strings.Index(text, "["); idx != -1 {
		if lastIdx := strings.LastIndex(text, "]"); lastIdx != -1 && lastIdx > idx {
			return text[idx : lastIdx+1]
		}
	}

	return text
}

// ValidateJSON 验证JSON字符串是否有效
func ValidateJSON(jsonStr string) error {
	var js json.RawMessage
	return json.Unmarshal([]byte(jsonStr), &js)
}

// Helper functions
func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
