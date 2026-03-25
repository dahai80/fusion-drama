package handlers

import (
	"strconv"

	"github.com/drama-generator/backend/application/services"
	"github.com/drama-generator/backend/domain/models"
	"github.com/drama-generator/backend/pkg/logger"
	"github.com/drama-generator/backend/pkg/response"
	"github.com/gin-gonic/gin"
)

type AgentConfigHandler struct {
	configService *services.AgentConfigService
	log           *logger.Logger
}

func NewAgentConfigHandler(configService *services.AgentConfigService, log *logger.Logger) *AgentConfigHandler {
	return &AgentConfigHandler{
		configService: configService,
		log:           log,
	}
}

// ListConfigs 获取所有 Agent 配置
func (h *AgentConfigHandler) ListConfigs(c *gin.Context) {
	configs, err := h.configService.ListConfigs()
	if err != nil {
		h.log.Errorw("Failed to list agent configs", "error", err)
		response.InternalError(c, err.Error())
		return
	}
	response.Success(c, configs)
}

// GetConfig 获取单个 Agent 配置
func (h *AgentConfigHandler) GetConfig(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid id")
		return
	}
	config, err := h.configService.GetConfig(uint(id))
	if err != nil {
		response.NotFound(c, "config not found")
		return
	}
	response.Success(c, config)
}

// UpdateConfig 更新 Agent 配置
func (h *AgentConfigHandler) UpdateConfig(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid id")
		return
	}

	var req struct {
		Model         *string  `json:"model"`
		SystemPrompt  *string  `json:"system_prompt"`
		Temperature   *float64 `json:"temperature"`
		MaxTokens     *int     `json:"max_tokens"`
		MaxIterations *int     `json:"max_iterations"`
		IsActive      *bool    `json:"is_active"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	updates := map[string]interface{}{}
	if req.Model != nil {
		updates["model"] = *req.Model
	}
	if req.SystemPrompt != nil {
		updates["system_prompt"] = *req.SystemPrompt
	}
	if req.Temperature != nil {
		updates["temperature"] = *req.Temperature
	}
	if req.MaxTokens != nil {
		updates["max_tokens"] = *req.MaxTokens
	}
	if req.MaxIterations != nil {
		updates["max_iterations"] = *req.MaxIterations
	}
	if req.IsActive != nil {
		updates["is_active"] = *req.IsActive
	}

	if len(updates) == 0 {
		response.BadRequest(c, "no fields to update")
		return
	}

	if err := h.configService.UpdateConfig(uint(id), updates); err != nil {
		h.log.Errorw("Failed to update agent config", "error", err, "id", id)
		response.InternalError(c, err.Error())
		return
	}

	config, err := h.configService.GetConfig(uint(id))
	if err != nil {
		response.InternalError(c, "failed to fetch updated config")
		return
	}
	response.Success(c, config)
}

// CreateConfig 创建 Agent 配置
func (h *AgentConfigHandler) CreateConfig(c *gin.Context) {
	var config models.AgentConfig
	if err := c.ShouldBindJSON(&config); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	if err := h.configService.CreateConfig(&config); err != nil {
		h.log.Errorw("Failed to create agent config", "error", err)
		response.InternalError(c, err.Error())
		return
	}
	response.Created(c, config)
}

// DeleteConfig 删除 Agent 配置
func (h *AgentConfigHandler) DeleteConfig(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		response.BadRequest(c, "invalid id")
		return
	}
	if err := h.configService.DeleteConfig(uint(id)); err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.Success(c, nil)
}
