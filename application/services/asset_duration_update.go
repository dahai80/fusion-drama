package services

import (
	"fmt"

	models "github.com/drama-generator/backend/domain/models"
)

// UpdateAssetDurationFromFile 从本地文件探测并更新视频Asset的时长
func (s *AssetService) UpdateAssetDurationFromFile(assetID uint, localFilePath string) error {
	var asset models.Asset
	if err := s.db.Where("id = ?", assetID).First(&asset).Error; err != nil {
		return fmt.Errorf("asset not found")
	}

	if asset.Type != models.AssetTypeVideo {
		return fmt.Errorf("asset is not a video")
	}

	if s.ffmpeg == nil {
		return fmt.Errorf("ffmpeg not available")
	}

	duration, err := s.ffmpeg.GetVideoDuration(localFilePath)
	if err != nil {
		return fmt.Errorf("failed to probe video duration: %w", err)
	}

	durationInt := int(duration + 0.5)
	if err := s.db.Model(&asset).Update("duration", durationInt).Error; err != nil {
		return fmt.Errorf("failed to update duration: %w", err)
	}

	s.log.Infow("Updated asset duration from file",
		"asset_id", assetID,
		"duration", durationInt,
		"file", localFilePath)

	return nil
}
