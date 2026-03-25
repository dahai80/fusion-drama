package models

import (
	"time"

	"gorm.io/gorm"
)

// AgentConfig 存储每个 Agent 类型的 LLM 配置
type AgentConfig struct {
	ID            uint           `gorm:"primaryKey;autoIncrement" json:"id"`
	AgentType     string         `gorm:"type:varchar(50);not null;uniqueIndex" json:"agent_type"` // script_rewriter, style_analyzer, etc.
	Name          string         `gorm:"type:varchar(100);not null" json:"name"`
	Description   string         `gorm:"type:varchar(500)" json:"description"`
	Model         string         `gorm:"type:varchar(100)" json:"model"`
	SystemPrompt  string         `gorm:"type:text" json:"system_prompt"`
	Temperature   float64        `gorm:"default:0.7" json:"temperature"`
	MaxTokens     int            `gorm:"default:4096" json:"max_tokens"`
	MaxIterations int            `gorm:"default:15" json:"max_iterations"`
	IsActive      bool           `gorm:"default:true" json:"is_active"`
	CreatedAt     time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt     time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`
}

func (AgentConfig) TableName() string {
	return "agent_configs"
}
