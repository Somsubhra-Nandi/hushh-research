// hushh-webapp/ios/App/App/Plugins/HushhAccountPlugin.swift
import Capacitor

/**
 * HushhAccountPlugin
 * Handles account-level operations like deletion.
 */
@objc(HushhAccountPlugin)
public class HushhAccountPlugin: CAPPlugin, CAPBridgedPlugin {
    
    public let identifier = "HushhAccountPlugin"
    public let jsName = "HushhAccount"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "deleteAccount", returnType: CAPPluginReturnPromise)
    ]
    
    private lazy var urlSession: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 45 // Longer timeout for deletion
        return URLSession(configuration: config)
    }()
    
    @objc func deleteAccount(_ call: CAPPluginCall) {
        // Get auth token passed from JS layer
        guard let authToken = call.getString("authToken") else {
             call.reject("Missing required parameter: authToken")
             return
        }
        let target = call.getString("target") ?? "both"
        
        let backendUrl = HushhProxyClient.resolveBackendUrl(
            call: call,
            plugin: self,
            jsName: jsName
        )
        
        guard let url = URL(string: "\(backendUrl)/api/account/delete") else {
            call.reject("Invalid URL")
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "target": target
        ])
        
        print("🚨 [HushhAccountPlugin] Requesting account deletion for target: \(target)")
        
        let task = urlSession.dataTask(with: request) { data, response, error in
            if let error = error {
                call.reject("Network error: \(error.localizedDescription)")
                return
            }
            
            if let httpResponse = response as? HTTPURLResponse {
                if (200...299).contains(httpResponse.statusCode) {
                    if let data = data,
                       let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                        call.resolve(json)
                    } else {
                        call.resolve(["success": true])
                    }
                } else {
                    // Try to parse error message
                    if let data = data, 
                       let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any], 
                       let detail = json["detail"] as? String {
                        call.reject(detail)
                    } else {
                         call.reject("Server returned \(httpResponse.statusCode)")
                    }
                }
            } else {
                call.reject("Invalid response")
            }
        }
        task.resume()
    }
}
