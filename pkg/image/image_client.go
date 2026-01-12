package image

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type ImageClient interface {
	GenerateImage(prompt string, opts ...ImageOption) (*ImageResult, error)
	GetTaskStatus(taskID string) (*ImageResult, error)
}

type ImageResult struct {
	TaskID    string
	Status    string
	ImageURL  string
	Width     int
	Height    int
	Error     string
	Completed bool
}

type ImageOptions struct {
	NegativePrompt  string
	Size            string
	Quality         string
	Style           string
	Steps           int
	CfgScale        float64
	Seed            int64
	Model           string
	Width           int
	Height          int
	ReferenceImages []string // 参考图片URL列表
}

type ImageOption func(*ImageOptions)

func WithNegativePrompt(prompt string) ImageOption {
	return func(o *ImageOptions) {
		o.NegativePrompt = prompt
	}
}

func WithSize(size string) ImageOption {
	return func(o *ImageOptions) {
		o.Size = size
	}
}

func WithQuality(quality string) ImageOption {
	return func(o *ImageOptions) {
		o.Quality = quality
	}
}

func WithStyle(style string) ImageOption {
	return func(o *ImageOptions) {
		o.Style = style
	}
}

func WithSteps(steps int) ImageOption {
	return func(o *ImageOptions) {
		o.Steps = steps
	}
}

func WithCfgScale(scale float64) ImageOption {
	return func(o *ImageOptions) {
		o.CfgScale = scale
	}
}

func WithSeed(seed int64) ImageOption {
	return func(o *ImageOptions) {
		o.Seed = seed
	}
}

func WithModel(model string) ImageOption {
	return func(o *ImageOptions) {
		o.Model = model
	}
}

func WithDimensions(width, height int) ImageOption {
	return func(o *ImageOptions) {
		o.Width = width
		o.Height = height
	}
}

func WithReferenceImages(images []string) ImageOption {
	return func(o *ImageOptions) {
		o.ReferenceImages = images
	}
}

type OpenAIImageClient struct {
	BaseURL    string
	APIKey     string
	Model      string
	HTTPClient *http.Client
}

type DALLERequest struct {
	Model   string   `json:"model"`
	Prompt  string   `json:"prompt"`
	Size    string   `json:"size,omitempty"`
	Quality string   `json:"quality,omitempty"`
	N       int      `json:"n"`
	Image   []string `json:"image,omitempty"` // 参考图片URL列表
}

type DALLEResponse struct {
	Created int64 `json:"created"`
	Data    []struct {
		URL           string `json:"url"`
		RevisedPrompt string `json:"revised_prompt,omitempty"`
	} `json:"data"`
}

func NewOpenAIImageClient(baseURL, apiKey, model string) *OpenAIImageClient {
	return &OpenAIImageClient{
		BaseURL: baseURL,
		APIKey:  apiKey,
		Model:   model,
		HTTPClient: &http.Client{
			Timeout: 10 * time.Minute,
		},
	}
}

func (c *OpenAIImageClient) GenerateImage(prompt string, opts ...ImageOption) (*ImageResult, error) {
	options := &ImageOptions{
		Size:    "1920x1920",
		Quality: "standard",
	}

	for _, opt := range opts {
		opt(options)
	}

	model := c.Model
	if options.Model != "" {
		model = options.Model
	}

	reqBody := DALLERequest{
		Model:   model,
		Prompt:  prompt,
		Size:    options.Size,
		Quality: options.Quality,
		N:       1,
		Image:   options.ReferenceImages,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	endpoint := c.BaseURL + "/v1/images/generations"
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

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
	}

	// 打印原始响应以便调试
	fmt.Printf("OpenAI API Response: %s\n", string(body))

	var result DALLEResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("parse response: %w, body: %s", err, string(body))
	}

	if len(result.Data) == 0 {
		return nil, fmt.Errorf("no image generated, response: %s", string(body))
	}

	return &ImageResult{
		Status:    "completed",
		ImageURL:  result.Data[0].URL,
		Completed: true,
	}, nil
}

func (c *OpenAIImageClient) GetTaskStatus(taskID string) (*ImageResult, error) {
	return nil, fmt.Errorf("not supported for OpenAI/DALL-E")
}

type StableDiffusionClient struct {
	BaseURL    string
	APIKey     string
	Model      string
	HTTPClient *http.Client
}

type SDRequest struct {
	Prompt         string   `json:"prompt"`
	NegativePrompt string   `json:"negative_prompt,omitempty"`
	Model          string   `json:"model,omitempty"`
	Width          int      `json:"width,omitempty"`
	Height         int      `json:"height,omitempty"`
	Steps          int      `json:"steps,omitempty"`
	CfgScale       float64  `json:"cfg_scale,omitempty"`
	Seed           int64    `json:"seed,omitempty"`
	Samples        int      `json:"samples"`
	Image          []string `json:"image,omitempty"` // 参考图片URL列表
}

type SDResponse struct {
	Status string `json:"status"`
	TaskID string `json:"task_id,omitempty"`
	Output []struct {
		URL string `json:"url"`
	} `json:"output,omitempty"`
	Error string `json:"error,omitempty"`
}

func NewStableDiffusionClient(baseURL, apiKey, model string) *StableDiffusionClient {
	return &StableDiffusionClient{
		BaseURL: baseURL,
		APIKey:  apiKey,
		Model:   model,
		HTTPClient: &http.Client{
			Timeout: 10 * time.Minute,
		},
	}
}

func (c *StableDiffusionClient) GenerateImage(prompt string, opts ...ImageOption) (*ImageResult, error) {
	options := &ImageOptions{
		Width:    1024,
		Height:   1024,
		Steps:    30,
		CfgScale: 7.5,
	}

	for _, opt := range opts {
		opt(options)
	}

	model := c.Model
	if options.Model != "" {
		model = options.Model
	}

	reqBody := SDRequest{
		Prompt:         prompt,
		NegativePrompt: options.NegativePrompt,
		Model:          model,
		Width:          options.Width,
		Height:         options.Height,
		Steps:          options.Steps,
		CfgScale:       options.CfgScale,
		Seed:           options.Seed,
		Samples:        1,
		Image:          options.ReferenceImages,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	endpoint := c.BaseURL + "/v1/images/generations"
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

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
	}

	var result SDResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}

	if result.Error != "" {
		return nil, fmt.Errorf("SD error: %s", result.Error)
	}

	if result.Status == "processing" {
		return &ImageResult{
			TaskID:    result.TaskID,
			Status:    "processing",
			Completed: false,
		}, nil
	}

	if len(result.Output) == 0 {
		return nil, fmt.Errorf("no image generated")
	}

	return &ImageResult{
		Status:    "completed",
		ImageURL:  result.Output[0].URL,
		Width:     options.Width,
		Height:    options.Height,
		Completed: true,
	}, nil
}

func (c *StableDiffusionClient) GetTaskStatus(taskID string) (*ImageResult, error) {
	endpoint := c.BaseURL + "/v1/images/status/" + taskID
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

	var result SDResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}

	imageResult := &ImageResult{
		TaskID:    taskID,
		Status:    result.Status,
		Completed: result.Status == "completed",
	}

	if result.Error != "" {
		imageResult.Error = result.Error
	}

	if len(result.Output) > 0 {
		imageResult.ImageURL = result.Output[0].URL
	}

	return imageResult, nil
}
