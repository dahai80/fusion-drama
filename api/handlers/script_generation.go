package handlers

import (
	"github.com/drama-generator/backend/application/services"
	"github.com/drama-generator/backend/pkg/config"
	"github.com/drama-generator/backend/pkg/logger"
	"github.com/drama-generator/backend/pkg/response"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type ScriptGenerationHandler struct {
	scriptService *services.ScriptGenerationService
	log           *logger.Logger
}

func NewScriptGenerationHandler(db *gorm.DB, cfg *config.Config, log *logger.Logger) *ScriptGenerationHandler {
	return &ScriptGenerationHandler{
		scriptService: services.NewScriptGenerationService(db, log),
		log:           log,
	}
}

func (h *ScriptGenerationHandler) GenerateOutline(c *gin.Context) {

	var req services.GenerateOutlineRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	result, err := h.scriptService.GenerateOutline(&req)
	if err != nil {
		h.log.Errorw("Failed to generate outline", "error", err)
		response.InternalError(c, err.Error())
		return
	}

	response.Success(c, result)
}

func (h *ScriptGenerationHandler) GenerateCharacters(c *gin.Context) {
	var req services.GenerateCharactersRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	// 同步执行角色生成
	characters, err := h.scriptService.GenerateCharacters(&req)
	if err != nil {
		h.log.Errorw("Failed to generate characters", "error", err)
		response.InternalError(c, "生成角色失败")
		return
	}

	response.Success(c, characters)
}

func (h *ScriptGenerationHandler) GenerateEpisodes(c *gin.Context) {

	var req services.GenerateEpisodesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	episodes, err := h.scriptService.GenerateEpisodes(&req)
	if err != nil {
		h.log.Errorw("Failed to generate episodes", "error", err)
		response.InternalError(c, err.Error())
		return
	}

	response.Success(c, episodes)
}
