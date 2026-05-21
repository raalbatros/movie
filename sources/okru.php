<?php
class OKruSource {
    private $headers;
    private $apiUrl = 'https://api.bnnapp.com/__proxy_host/api.ok.ru/api';
    private $appKey = 'CBAFJIICABABABABA';
    private $token = '800041591478_3f35c54f1911a99d013bc24ab5c86337a3964d5b4c682b1bd15287b04d689ba6';
    
    public function __construct() {
        $this->headers = [
            'Accept: application/json',
            'Connection: Keep-Alive',
            'Content-Type: application/x-www-form-urlencoded',
            'Host: api.bnnapp.com',
            'User-Agent: OKAndroid/25.11.28 b25112800 (Android 9; tr_TR)',
        ];
    }
    
    public function getPopularMovies($limit = 100) {
        $sessionKey = $this->login();
        if (!$sessionKey) return [];
        
        $movies = [];
        $keywords = ['full movie', 'turkce dublaj film', 'hd film', '2024 film', '2025 film'];
        
        foreach ($keywords as $keyword) {
            $videoIds = $this->searchVideos($sessionKey, $keyword, ceil($limit / count($keywords)));
            foreach ($videoIds as $videoId) {
                $movie = $this->getVideoDetails($sessionKey, $videoId);
                if ($movie && $movie['duration'] > 3600) { // 1 saatten uzunsa film
                    $movies[] = $movie;
                }
                sleep(1);
                if (count($movies) >= $limit) break 2;
            }
        }
        
        return $movies;
    }
    
    private function login() {
        $loginData = "application_key={$this->appKey}&deviceId=INSTALL_ID=bfacced7-340e-4cd0-bb05-3ccd1b6b1c69;DEVICE_ID=903910667827172;ANDROID_ID=adcda19bf1b12eb8;&gaid=0501236e-7ba8-46de-bb58-e3bd542aa4c8&mtid=de3c9872-2ee5-4181-b15d-2a323287c47b&token={$this->token}&verification_supported=true&verification_supported_v=6";
        
        $response = $this->postRequest("{$this->apiUrl}/auth/loginByToken", $loginData);
        preg_match('#"session_key":"(.*?)"#', $response, $match);
        return $match[1] ?? null;
    }
    
    private function searchVideos($sessionKey, $keyword, $count = 20) {
        $methods = json_encode([[
            'video.search' => [
                'params' => [
                    'q' => $keyword,
                    'fields' => 'video.id',
                    'count' => $count
                ]
            ]
        ]]);
        
        $ticket = "application_key={$this->appKey}&session_key={$sessionKey}&methods=" . urlencode($methods);
        $response = $this->postRequest("{$this->apiUrl}/batch/executeV2", $ticket);
        
        preg_match_all('#"id":"(\d+)"#', $response, $matches);
        return $matches[1] ?? [];
    }
    
    private function getVideoDetails($sessionKey, $videoId) {
        $methods = json_encode([[
            'video.getVideos' => [
                'params' => [
                    'fields' => 'video.url_mp4,video.title,video.duration,video.thumbnail_url,video.total_views',
                    'vids' => $videoId
                ]
            ]
        ]]);
        
        $ticket = "application_key={$this->appKey}&session_key={$sessionKey}&methods=" . urlencode($methods);
        $response = $this->postRequest("{$this->apiUrl}/batch/executeV2", $ticket);
        
        preg_match('#"url_mp4":"(.*?)"#', $response, $urlMatch);
        preg_match('#"title":"(.*?)"#', $response, $titleMatch);
        preg_match('#"duration":(\d+)#', $response, $durationMatch);
        preg_match('#"total_views":(\d+)#', $response, $viewsMatch);
        
        if (empty($urlMatch[1])) return null;
        
        return [
            'title' => str_replace(['\\"', '\\\\'], '', $titleMatch[1] ?? 'Bilinmeyen Film'),
            'url' => "https:" . $urlMatch[1],
            'duration' => $durationMatch[1] ?? 0,
            'views' => $viewsMatch[1] ?? 0,
            'thumbnail' => $this->getThumbnail($response),
            'source' => 'ok.ru'
        ];
    }
    
    private function postRequest($url, $data) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_SSL_VERIFYHOST => false,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $data,
            CURLOPT_HTTPHEADER => $this->headers,
            CURLOPT_TIMEOUT => 30
        ]);
        $res = curl_exec($ch);
        curl_close($ch);
        return $res;
    }
    
    private function getThumbnail($response) {
        preg_match('#"thumbnail_url":"(.*?)"#', $response, $match);
        return $match[1] ?? '';
    }
}
?>
