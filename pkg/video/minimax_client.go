package video

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// MinimaxClient Minimax视频生成客户端
type MinimaxClient struct {
	BaseURL    string
	APIKey     string
	Model      string
	HTTPClient *http.Client
}

type MinimaxSubjectReference struct {
	Type  string   `json:"type"`
	Image []string `json:"image"`
}

type MinimaxRequest struct {
	Prompt           string                    `json:"prompt"`
	FirstFrameImage  string                    `json:"first_frame_image,omitempty"`
	LastFrameImage   string                    `json:"last_frame_image,omitempty"`
	SubjectReference []MinimaxSubjectReference `json:"subject_reference,omitempty"`
	Model            string                    `json:"model"`
	Duration         int                       `json:"duration,omitempty"`
	Resolution       string                    `json:"resolution,omitempty"`
}

type MinimaxResponse struct {
	TaskID   string `json:"task_id"`
	Status   string `json:"status"`
	BaseResp struct {
		StatusCode int    `json:"status_code"`
		StatusMsg  string `json:"status_msg"`
	} `json:"base_resp"`
	Video struct {
		URL      string `json:"url"`
		Duration int    `json:"duration"`
	} `json:"video"`
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

func NewMinimaxClient(baseURL, apiKey, model string) *MinimaxClient {
	return &MinimaxClient{
		BaseURL: baseURL,
		APIKey:  apiKey,
		Model:   model,
		HTTPClient: &http.Client{
			Timeout: 300 * time.Second,
		},
	}
}

// GenerateVideo 生成视频（支持首尾帧和主体参考）
func (c *MinimaxClient) GenerateVideo(imageURL, prompt string, opts ...VideoOption) (*VideoResult, error) {
	options := &VideoOptions{
		Duration:   6,
		Resolution: "1080P",
	}

	for _, opt := range opts {
		opt(options)
	}

	model := c.Model
	if options.Model != "" {
		model = options.Model
	}

	reqBody := MinimaxRequest{
		Prompt:   prompt,
		Model:    model,
		Duration: options.Duration,
	}

	// 设置分辨率
	if options.Resolution != "" {
		reqBody.Resolution = options.Resolution
	}

	// 如果有首帧图片（从imageURL或FirstFrameURL）
	if options.FirstFrameURL != "" {
		reqBody.FirstFrameImage = options.FirstFrameURL
	} else if imageURL != "" {
		reqBody.FirstFrameImage = imageURL
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	endpoint := c.BaseURL + "/v1/video_generation"
	req, err := http.NewRequest("POST", endpoint, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.APIKey)

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
	}

	var result MinimaxResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}

	if result.Error.Message != "" {
		return nil, fmt.Errorf("minimax error: %s", result.Error.Message)
	}

	videoResult := &VideoResult{
		TaskID:    result.TaskID,
		Status:    result.Status,
		Completed: result.Status == "completed",
		Duration:  result.Video.Duration,
	}

	if result.Video.URL != "" {
		videoResult.VideoURL = result.Video.URL
		videoResult.Completed = true
	}

	return videoResult, nil
}

func (c *MinimaxClient) GetTaskStatus(taskID string) (*VideoResult, error) {
	endpoint := c.BaseURL + "/v1/video_generation/" + taskID
	req, err := http.NewRequest("GET", endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+c.APIKey)

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	var result MinimaxResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}

	videoResult := &VideoResult{
		TaskID:    result.TaskID,
		Status:    result.Status,
		Completed: result.Status == "completed",
		Duration:  result.Video.Duration,
	}

	if result.Error.Message != "" {
		videoResult.Error = result.Error.Message
	}

	if result.Video.URL != "" {
		videoResult.VideoURL = result.Video.URL
		videoResult.Completed = true
	}

	return videoResult, nil
}
