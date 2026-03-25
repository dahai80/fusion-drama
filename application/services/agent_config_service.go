package services

import (
	"fmt"

	models "github.com/drama-generator/backend/domain/models"
	"github.com/drama-generator/backend/pkg/logger"
	"gorm.io/gorm"
)

type AgentConfigService struct {
	db  *gorm.DB
	log *logger.Logger
}

func NewAgentConfigService(db *gorm.DB, log *logger.Logger) *AgentConfigService {
	return &AgentConfigService{db: db, log: log}
}

// ListConfigs 获取所有 Agent 配置
func (s *AgentConfigService) ListConfigs() ([]models.AgentConfig, error) {
	var configs []models.AgentConfig
	if err := s.db.Order("agent_type ASC").Find(&configs).Error; err != nil {
		return nil, err
	}
	return configs, nil
}

// GetConfig 获取单个 Agent 配置
func (s *AgentConfigService) GetConfig(id uint) (*models.AgentConfig, error) {
	var config models.AgentConfig
	if err := s.db.First(&config, id).Error; err != nil {
		return nil, err
	}
	return &config, nil
}

// GetConfigByAgentType 按 Agent 类型获取配置
func (s *AgentConfigService) GetConfigByAgentType(agentType string) (*models.AgentConfig, error) {
	var config models.AgentConfig
	if err := s.db.Where("agent_type = ? AND is_active = ?", agentType, true).First(&config).Error; err != nil {
		return nil, err
	}
	return &config, nil
}

// CreateConfig 创建 Agent 配置
func (s *AgentConfigService) CreateConfig(config *models.AgentConfig) error {
	return s.db.Create(config).Error
}

// UpdateConfig 更新 Agent 配置
func (s *AgentConfigService) UpdateConfig(id uint, updates map[string]interface{}) error {
	result := s.db.Model(&models.AgentConfig{}).Where("id = ?", id).Updates(updates)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return fmt.Errorf("config not found")
	}
	return nil
}

// DeleteConfig 删除 Agent 配置
func (s *AgentConfigService) DeleteConfig(id uint) error {
	result := s.db.Delete(&models.AgentConfig{}, id)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return fmt.Errorf("config not found")
	}
	return nil
}

// EnsureDefaults 确保所有 Agent 类型都有默认配置
func (s *AgentConfigService) EnsureDefaults() {
	defaults := []models.AgentConfig{
		{AgentType: "script_rewriter", Name: "剧本改写", Description: "将小说改写为短剧剧本", Temperature: 0.8, MaxTokens: 8192, MaxIterations: 15},
		{AgentType: "style_analyzer", Name: "风格分析", Description: "分析剧本的视觉风格", Temperature: 0.5, MaxTokens: 4096, MaxIterations: 10},
		{AgentType: "extractor", Name: "角色场景提取", Description: "从剧本提取角色、场景和道具", Temperature: 0.3, MaxTokens: 4096, MaxIterations: 10},
		{AgentType: "voice_assigner", Name: "角色音色", Description: "为角色分配合适的音色", Temperature: 0.5, MaxTokens: 2048, MaxIterations: 10},
		{AgentType: "storyboard_breaker", Name: "分镜拆解", Description: "将剧本拆解为分镜", Temperature: 0.6, MaxTokens: 16384, MaxIterations: 15},
		{AgentType: "prompt_generator", Name: "提示词生成", Description: "生成图片和视频的AI提示词", Temperature: 0.7, MaxTokens: 4096, MaxIterations: 15},
	}

	for _, d := range defaults {
		var count int64
		s.db.Model(&models.AgentConfig{}).Where("agent_type = ?", d.AgentType).Count(&count)
		if count == 0 {
			d.IsActive = true
			if err := s.db.Create(&d).Error; err != nil {
				s.log.Warnw("Failed to create default agent config", "agent_type", d.AgentType, "error", err)
			}
		}
	}
}
