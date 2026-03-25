package handlers

import (
	"encoding/json"
	"fmt"
	"io"

	"github.com/drama-generator/backend/application/services"
	"github.com/drama-generator/backend/pkg/logger"
	"github.com/drama-generator/backend/pkg/response"
	"github.com/gin-gonic/gin"
)

type AgentHandler struct {
	agentService *services.AgentService
	log          *logger.Logger
}

func NewAgentHandler(agentService *services.AgentService, log *logger.Logger) *AgentHandler {
	return &AgentHandler{
		agentService: agentService,
		log:          log,
	}
}

// GetDebugInfo 获取 Agent 调试信息
// GET /api/v1/agent/:type/debug
func (h *AgentHandler) GetDebugInfo(c *gin.Context) {
	agentType := c.Param("type")
	if !services.IsValidAgentType(agentType) {
		response.BadRequest(c, fmt.Sprintf("invalid agent type: %s", agentType))
		return
	}

	info, err := h.agentService.GetDebugInfo(c.Request.Context(), agentType)
	if err != nil {
		h.log.Errorw("Failed to get debug info", "error", err)
		response.InternalError(c, err.Error())
		return
	}
	response.Success(c, info)
}

// UpdateSkill 更新 Skill 文件内容
// PUT /api/v1/agent/:type/skills/:name
func (h *AgentHandler) UpdateSkill(c *gin.Context) {
	agentType := c.Param("type")
	skillName := c.Param("name")

	if !services.IsValidAgentType(agentType) {
		response.BadRequest(c, "invalid agent type")
		return
	}

	var req struct {
		Dir     string `json:"dir" binding:"required"`
		Content string `json:"content" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	if err := h.agentService.UpdateSkillContent(req.Dir, skillName, req.Content); err != nil {
		h.log.Errorw("Failed to update skill", "error", err)
		response.InternalError(c, err.Error())
		return
	}
	response.Success(c, nil)
}

// StreamChat SSE 流式 Agent 对话
// POST /api/v1/agent/:type/chat
func (h *AgentHandler) StreamChat(c *gin.Context) {
	agentType := c.Param("type")
	if !services.IsValidAgentType(agentType) {
		response.BadRequest(c, fmt.Sprintf("invalid agent type: %s", agentType))
		return
	}

	var req services.AgentChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	ctx := c.Request.Context()

	// 启动 Agent 流
	eventCh, err := h.agentService.StreamChat(ctx, agentType, req)
	if err != nil {
		h.log.Errorw("Failed to start agent chat", "error", err, "agent_type", agentType)
		response.InternalError(c, err.Error())
		return
	}

	// 设置 SSE headers
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	c.Stream(func(w io.Writer) bool {
		select {
		case event, ok := <-eventCh:
			if !ok {
				return false
			}
			data, _ := json.Marshal(event.Data)
			c.SSEvent(event.Type, string(data))
			c.Writer.Flush()

			// done 或 error 事件后停止
			if event.Type == "done" || event.Type == "error" {
				return false
			}
			return true
		case <-ctx.Done():
			return false
		}
	})
}
